// Import
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const mysql = require('mysql2');
const util = require('util');
const imageUrlsPath = './imageUrls.json';

// dotenv
require('dotenv').config();

// Variables
let existingPrints = {};
let latestPrints = {};
let imageUrls;
let lastGeneratedCode = '';
const existingCodes = {};
const cardCounts = {};
const cooldowns = new Map();
const allowedUserIds = process.env.DEVS;
const itemEmojis = {
  coins: '💰',
  common_ticket: '🎫',
  scroll:'📜',
};
const itemPrices = {
  common_ticket: 1,
  scroll: 2
};

const shopItems = {
  common_ticket: { cost: 1, itemType: 'common_ticket' },
  scroll: { cost: 2, itemType: 'scroll' },
};

// Client
const client = new Client({
  intents: [ 
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Database connection
const connection = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: "",
    database: process.env.DB_NAME,
});

const query = util.promisify(connection.query).bind(connection);

try {
  const imageUrlsData = fs.readFileSync(imageUrlsPath, 'utf8');
  imageUrls = JSON.parse(imageUrlsData);
} catch (error) {
  console.error('Error reading imageUrls file:', error.message);
  process.exit(1);
}


const loadLatestPrintsFromDatabase = async () => {
  try {
    const selectMaxPrintsQuery = 'SELECT card_name, MAX(latest_print) AS max_print FROM card_info GROUP BY card_name';
    const maxPrintResults = await query(selectMaxPrintsQuery);

    const maxPrints = {};
    maxPrintResults.forEach((row) => {
      maxPrints[row.card_name] = row.max_print;
    });

    //console.log('Latest prints loaded from the database:', maxPrints);
    return maxPrints;
  } catch (error) {
    console.error('Error loading latest prints from the database:', error.message);
    return {};
  }
};

const loadExistingPrintsFromDatabase = async () => {
  try {
    const latestPrints = await loadLatestPrintsFromDatabase();
    existingPrints = { ...latestPrints };
    //console.log('Existing prints loaded from the latest prints:', existingPrints);

    // Wczytaj liczniki z bazy danych
    const loadCountsQuery = 'SELECT card_name, latest_print FROM card_info';
    const counts = await query(loadCountsQuery);
    counts.forEach((row) => {
      cardCounts[row.card_name] = row.latest_print;
    });

    //console.log('Card counts loaded from the database:', cardCounts);
  } catch (error) {
    console.error('Error loading existing prints from the latest prints:', error.message);
  }
};


const updateLatestPrintInDatabase = async (cardName, latestPrint) => {
  try {
    //console.log(`Attempting to update latest print in the database for ${cardName} to ${latestPrint}`);

    // Sprawdź, czy latestPrint jest liczbą lub stringiem
    if (typeof latestPrint !== 'string' && typeof latestPrint !== 'number') {
      console.error(`Error updating latest print in database for ${cardName}: latestPrint must be a string or number.`);
      return;
    }

    const updateQuery = 'UPDATE card_info SET latest_print = ? WHERE card_name = ?';
    const [updateResult] = await connection.execute(updateQuery, [latestPrint, cardName]);

    console.log(`Card: ${cardName}, Latest Print: ${latestPrint}`);
    console.log('Update result:', updateResult);

    if (updateResult.affectedRows > 0) {
      console.log(`Updated latest print in the database for ${cardName}.`);
    } else {
      console.log(`Failed to update latest print in the database for ${cardName}. No rows affected.`);
    }
  } catch (error) {
    //console.error(`Error updating latest print in database for ${cardName}:`, error.message);
    //console.error('Error stack:', error.stack);
  }
};

// Ready event
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.username}!`);

  // Load latest prints from the database
  const loadedLatestPrints = await loadLatestPrintsFromDatabase();
  //console.log('Latest prints loaded from the database:', loadedLatestPrints);

  // Load existing prints from the database
  loadExistingPrintsFromDatabase();
});

// MessageCreate event
client.on('messageCreate', async (msg) => {
  const command = msg.content.toLowerCase(); // Convert command to lowercase for case-insensitivity

  // Define command aliases
  const aliases = {
    '!lalo': ['!draw', 'lalo', '!summon','!l'], 
    '!inventory': ['!cards', '!cardinv', '!inv', '!i'], 
    '!register': ['!signup'], 
    '!helpme': ['!commands', '!h'], 
    '!view': ['!v', '!show'],
    '!remove': ['!burn', '!destroy', '!rm'], 
  };

  // Check if the received command is an alias, and replace it with the actual command
  for (const [actualCommand, aliasList] of Object.entries(aliases)) {
    if (aliasList.includes(command)) {
      msg.content = actualCommand;
      break;
    }
  }

  if (msg.content === 'ping') {
    msg.channel.send('pong');
  } else if (msg.content === 'mlalo'&& !msg.interaction) {
    if (msg.alreadyExecuted) return; // Dodaj tę linię

    msg.alreadyExecuted = true; // Dodaj tę linię


    if (cooldowns.has(msg.author.id)) {
      const expirationTime = cooldowns.get(msg.author.id);
      const remainingTime = expirationTime - Date.now();
      if (remainingTime > 0) {
        return msg.reply(`Please wait ${Math.ceil(remainingTime / 1000)} seconds before using the command again.`);
      }
    }
    const cooldownTime = 2000;
    cooldowns.set(msg.author.id, Date.now() + cooldownTime);
    const canvas = createCanvas(1875, 875);
    const ctx = canvas.getContext('2d');

    const loadAndDrawImage = async (imageUrl, x, y, width, height, cardName, series) => {
      const image = await loadImage(imageUrl);
      ctx.drawImage(image, x, y, width, height);
    
      // Load and draw the overlay image
      const overlayImageUrl = './Frame01.png';
      const overlayImage = await loadImage(overlayImageUrl);
      ctx.drawImage(overlayImage, x, y, width, height);
    
      if (!cardCounts[cardName]) {
        cardCounts[cardName] = 1;
      } else {
        cardCounts[cardName]++;
      }
    
      const cardPrint = cardCounts[cardName];
      const cardCode = await generateUniqueCode();
    
      const textBgHeight = 60;
      ctx.fillStyle = 'white';
      ctx.fillRect(x, y + height, width, textBgHeight);
      ctx.font = '40px Arial';
      ctx.fillStyle = 'black';
      const textWidth = ctx.measureText(`${cardName} #${cardPrint}, ~${cardCode}`).width;
      ctx.fillText(
        `${cardName} #${cardPrint}  ~${cardCode}`,
        x + (width - textWidth) / 2,
        y + height + textBgHeight / 2 + 10
      );
    
      // Dodaj wczytywanie baseElement z pliku imageUrls.json
      const imageUrls = JSON.parse(fs.readFileSync('imageUrls.json', 'utf8'));
      const baseElement = imageUrls.find(img => img.name === cardName)?.baseElement || 'defaultBaseElement';
    
      return { cardPrint, cardCode, baseElement };
    };
    
    const selectedImages = getRandomImages();
    const singleImageWidth = 500;
    const singleImageHeight = 700;
    const spacing = 50;
    const topMargin = 20;
    const cardsData = [];
    const elements = ['🔥', '🗿', '💧', '⚙️']; // Dodane


    for (let i = 0; i < selectedImages.length; i++) {
      const x = i * (singleImageWidth + spacing) + spacing;
      const y = topMargin + (canvas.height - topMargin * 2 - singleImageHeight) / 2;

      const cardData = await loadAndDrawImage(
        selectedImages[i].url,
        x,
        y,
        singleImageWidth,
        singleImageHeight,
        selectedImages[i].name,
        selectedImages[i].series, 
        selectedImages[i].baseElement
      );
    

      const element = getRandomElementWithChances(elements, [30, 30, 30, 10]); // Dodane
      //console.log('Element before getEmojiForElement:', element);
      //console.log('getEmojiForElement(element):', getEmojiForElement(element));
      cardsData.push({ ...cardData, element });
      //console.log('Element before getEmojiForElement:', element); // Dodane
      //console.log('getEmojiForElement(element):', getEmojiForElement(element)); // Dodane

      //console.log('Latest prints before update:', latestPrints);
       // Update the latest print for this card in the database
       updateLatestPrintInDatabase(selectedImages[i].name, cardData.cardPrint);
    }

    const buffer = canvas.toBuffer();

    const reply = await msg.reply({
      content: `Summoning 3 cards:`,
      files: [buffer],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: '1',
              custom_id: '1',
            },
            {
              type: 2,
              style: 1,
              label: '2',
              custom_id: '2',
            },
            {
              type: 2,
              style: 1,
              label: '3',
              custom_id: '3',
            },
          ],
        },
      ],
    });

    const filter = (interaction) => interaction.isButton() && interaction.message.id === reply.id;
    const collector = reply.createMessageComponentCollector({ filter, time: 15000 });

    collector.on('collect', async (interaction) => {
      const buttonId = interaction.customId;
      const cardData = cardsData[parseInt(buttonId) - 1];
      const { cardPrint, cardCode, element } = cardData; // Dodane
    
      // Add card information to the database
      const userId = interaction.user.id;
      const cardName = selectedImages[parseInt(buttonId) - 1].name;
      const cardUrl = selectedImages[parseInt(buttonId) - 1].url;
      const series = selectedImages[parseInt(buttonId) - 1].series; // Get the series property
      

      const elementString = element ? getEmojiForElement(element) : 'unknown'; // Ustawia domyślną wartość, jeśli element nie jest zdefiniowany
     // Check if the user exists in the players table
      const checkUserQuery = 'SELECT * FROM players WHERE user_id = ?';
      const checkUserValues = [userId];
    
      connection.query(checkUserQuery, checkUserValues, async (err, userResults) => {
        if (err) {
          console.error('Error checking user in database:', err.message);
        } else {
          if (userResults.length === 0) {
            // User does not exist, inform them to use the !register command
            await interaction.reply('You need to register first! Use the command `mregister`.');
          } else {
            // User exists, check if they already have this card in their inventory
            const checkCardQuery = 'SELECT * FROM card_inventory WHERE user_id = ? AND card_name = ?';
            const checkCardValues = [userId, cardName];
    
            connection.query(checkCardQuery, checkCardValues, async (cardErr, cardResults) => {
              if (cardErr) {
                console.error('Error checking card in database:', cardErr.message);
              } else {
                console.log('Series:', series); // Dodaj to, aby sprawdzić wartość series przed wywołaniem funkcji

                // Add card to the database
                addCardToDatabase(userId, cardName, cardUrl, cardPrint, cardCode, series, element, cardData.baseElement);

    
                try {
                  await interaction.deferUpdate();
                  const emojiForElement = getEmojiForElement(element);
                  await interaction.followUp(`"${cardName}" #${cardPrint} \`${cardCode}\` from \`${series}\` of ${element} element has been added to your inventory!\nBase Element: ${cardData.baseElement}`);
    
                  // Check if it's the first card of this type
                  if (cardResults.length === 0) {
                    reply.components[0].components.forEach((button) => (button.disabled = true));
                    await reply.edit({ components: reply.components });
                  }
    
                  collector.stop();
    
                  setTimeout(() => {
                    reply.edit({ components: [] });
                  }, 1000);
                } catch (error) {
                  console.error(error);
                }
              }
            });
          }
        }
      });
    });
    
    collector.on('end', () => {
      reply.edit({ components: [] });
    });
  } else if (msg.content.startsWith('maddimage') && allowedUserIds.includes(msg.author.id)) {
    const args = msg.content.slice('maddimage'.length).trim().split(' ');
  
    if (args.length === 4) {
      const name = args[0];
      const url = args[1];
      const series = args[2];
      const baseElement = args[3]; // New parameter for base element emoji
  
      // Check if the base element is one of the specified emojis
      const validBaseElements = ['🔥', '🗿', '💧', '⚙️'];
      if (!validBaseElements.includes(baseElement)) {
        msg.reply('Invalid base element emoji. Please use one of the following: 🔥, 🗿, 💧, ⚙️.');
        return;
      }
  
      // Add new image to the imageUrls array with base element
      imageUrls.push({ name, url, series, baseElement });
  
      // Save changes to the file
      saveUpdatedImageUrls();
  
      // Add card info to the database
      addCardInfoToDatabase(name, 0, baseElement); // latestPrint set to 0 by default
  
      msg.reply(`Image "${name}" added successfully.`);
      console.log('New image was added');
    } else {
      msg.reply('Invalid command format. Use !addimage <name> <url> <series> <🔥or🗿or💧or⚙️>.');
    }
  
    return;
  } else if (msg.content.startsWith('minventory')) {
    const userId = msg.author.id;
    let currentPage = 1;
    const cardsPerPage = 10;
    let inventoryMessage = null;

    // Parse the name parameter from the command
    const match = msg.content.match(/name=(\S+)/);
    const cardName = match ? match[1] : null;

    // Generate unique button IDs based on user, command invocation time, and button type
    const buttonLeftId = `buttonLeft_${userId}_${Date.now()}_inventory`;
    const buttonRightId = `buttonRight_${userId}_${Date.now()}_inventory`;

    const sendInventory = (page) => {
        // Get the total number of cards the player has
        let countQuery, query, values;

        if (cardName) {
            // Count only cards with the specified name
            countQuery = 'SELECT COUNT(*) AS cardCount FROM card_inventory WHERE user_id = ? AND card_name = ?';
            query = 'SELECT * FROM card_inventory WHERE user_id = ? AND card_name = ? ORDER BY date_added DESC LIMIT ? OFFSET ?';
            values = [userId, cardName, cardsPerPage, (page - 1) * cardsPerPage];
        } else {
            // Count all cards
            countQuery = 'SELECT COUNT(*) AS cardCount FROM card_inventory WHERE user_id = ?';
            query = 'SELECT * FROM card_inventory WHERE user_id = ? ORDER BY date_added DESC LIMIT ? OFFSET ?';
            values = [userId, cardsPerPage, (page - 1) * cardsPerPage];
        }

        connection.query(countQuery, [userId, cardName], (err, countResults) => {
            if (err) {
                console.error('Error counting player cards:', err.message);
                return;
            }

            const totalCards = countResults[0].cardCount;

            // Calculate the total number of pages
            const totalPages = Math.ceil(totalCards / cardsPerPage);

            // Ensure the requested page is within bounds
            currentPage = Math.max(1, Math.min(totalPages, page));

            connection.query(query, values, (err, results) => {
                if (err) {
                    console.error('Error fetching player inventory:', err.message);
                    return;
                }

                if (results.length === 0) {
                    msg.reply(`Your inventory is empty.`);
                    return;
                }

                let description = `You have ${totalCards} cards.`;

                if (cardName) {
                    description = `You have ${totalCards} cards of type "${cardName}".`;
                }

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`Your Card Inventory - Page ${currentPage}/${totalPages}`)
                    .setDescription(description)
                    .addFields(
                        results.map((card, index) => ({
                            name: ` `,
                            value: ` \`${card.card_code}\`  •  ${card.card_name}  •  #${card.card_print}  •  \`${card.series}\`  •  Element: ${card.element} ${getEmojiForElement(card.element)}\nBase Element: ${card.base_element}`,  // Dodane
                        }))
                    );

                // Add buttons with emoji arrows directly to the components array
                const components = [
                    {
                        type: 1, // ActionRow
                        components: [
                            {
                                type: 2, // Button
                                style: currentPage === 1 ? 2 : 1, // Disable if on the first page
                                label: '⬅️ Previous',
                                customId: buttonLeftId,
                                disabled: currentPage === 1,
                            },
                            {
                                type: 2, // Button
                                style: currentPage === totalPages ? 2 : 1, // Disable if on the last page
                                label: '➡️ Next',
                                customId: buttonRightId,
                                disabled: currentPage === totalPages,
                            },
                        ],
                    },
                ];

                // If the inventory message is not sent, send it
                if (!inventoryMessage) {
                    msg.reply({ embeds: [embed], components: components }).then((message) => {
                        inventoryMessage = message;
                    });
                } else {
                    // If the inventory message is sent, edit it
                    inventoryMessage.edit({ embeds: [embed], components: components }).catch((err) => {
                        console.error('Error editing inventory message:', err);
                    });
                }
            });
        });
    };

    // Handle button interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        // Handle Left button
        if (interaction.customId === buttonLeftId) {
            // Acknowledge the interaction
            interaction.deferred ? interaction.editReply('') : interaction.deferUpdate();
            sendInventory(currentPage - 1);
        }

        // Handle Right button
        if (interaction.customId === buttonRightId) {
            // Acknowledge the interaction
            interaction.deferred ? interaction.editReply('') : interaction.deferUpdate();
            sendInventory(currentPage + 1);
        }
    });

    // Initial inventory display
    sendInventory(currentPage);
  } else if (msg.content === 'mregister') {
    const userId = msg.author.id;

    // Check if the user exists in the players table
    const checkUserQuery = 'SELECT * FROM players WHERE user_id = ?';
const checkUserValues = [userId];

connection.query(checkUserQuery, checkUserValues, (err, userResults) => {
  if (err) {
    console.error('Error checking user in database:', err.message);
  } else {
    if (userResults.length === 0) {
      // User does not exist, add them to the players table
      addPlayerToDatabase(userId, 'default_username'); // You can customize the default username
      msg.reply('You have been successfully registered!');
    } else {
      // User already exists
      msg.reply('You are already registered!');
      // Continue with the rest of the logic here
      // ...
    }
  }
});
  } else if (msg.content === 'mhelp') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('CardBot Commands')
      .setDescription('Here are the available commands:')
      .addFields(
        { name: 'mlalo', value: 'Summon 3 random cards.', inline: true },
        { name: 'minventory', value: 'View your card inventory.', inline: true },
        { name: 'mregister', value: 'Register as a player.', inline: true },
        { name: 'maddimage <name> <url>', value: 'Add a new image to the card pool (admin only).', inline: true },
        { name: 'mhelpme', value: 'Display this help message.', inline: true },
        { name: 'mview <code>', value: 'View a card by its code.', inline: true },
        { name: 'mremove <code>', value: 'Remove a card by its code.', inline: true },
        { name: 'mitems', value: 'View all items in your inventory.', inline: true },
      );

    msg.reply({ embeds: [embed] });
  } else if (msg.content.startsWith('mview')) {
    const userId = msg.author.id;
    const codeToView = msg.content.slice('!view'.length).trim();

    // Check if the user exists in the players table
    const checkUserQuery = 'SELECT * FROM players WHERE user_id = ?';
    const checkUserValues = [userId];

    connection.query(checkUserQuery, checkUserValues, (err, userResults) => {
      if (err) {
        console.error('Error checking user in database:', err.message);
      } else {
        if (userResults.length === 0) {
          // User does not exist, inform them to use the !register command
          msg.reply('You need to register first! Use the command `mregister`.');
        } else {
          // User exists, check if a card with the given code exists in their inventory
          const checkCardQuery = 'SELECT * FROM card_inventory WHERE user_id = ? AND card_code = ?';
          const checkCardValues = [userId, codeToView];

          connection.query(checkCardQuery, checkCardValues, async (cardErr, cardResults) => {
            if (cardErr) {
              console.error('Error checking card in database:', cardErr.message);
            } else {
              if (cardResults.length === 0) {
                msg.reply(`Card with code ${codeToView} not found in your inventory.`);
              } else {
                // Card found, load the image and generate the view
                const card = cardResults[0];
                const imageUrl = card.card_url;
                const print = card.card_print;
                const name = card.card_name;

                // Load the card image
                const cardImage = await loadImage(imageUrl);

                // Define new image size
                const newWidth = 1500;
                const newHeight = 2100;
                const overlayWidthIncrease = 5; // Increase the width by five pixels
                const overlayShiftLeft = 1; // Shift the overlay one pixel to the left
                const canvas = createCanvas(newWidth, newHeight);
                const ctx = canvas.getContext('2d');

                // Calculate new image proportions
                const scaleFactor = Math.min(newWidth / cardImage.width, newHeight / cardImage.height);

                // Calculate position to center the image
                const offsetX = (newWidth - cardImage.width * scaleFactor) / 2;
                const offsetY = (newHeight - cardImage.height * scaleFactor) / 2;

                // Draw the card image with the new proportions and position
                ctx.drawImage(cardImage, offsetX, offsetY, cardImage.width * scaleFactor, cardImage.height * scaleFactor);

                // Load and draw the overlay image
                const overlayImageUrl = './Frame01.png'; // Replace with the path to your second overlay image
                const overlayImage = await loadImage(overlayImageUrl);

                // Scale the overlay image to the size of the card image with width increase
                const overlayWidth = cardImage.width + overlayWidthIncrease;
                const overlayHeight = cardImage.height;
                const overlayX = offsetX - overlayWidthIncrease / 2 - overlayShiftLeft; // Shift and center the overlay horizontally
                const overlayY = offsetY;

                ctx.drawImage(
                  overlayImage,
                  overlayX,
                  overlayY,
                  overlayWidth * scaleFactor,
                  overlayHeight * scaleFactor
                );

                ctx.font = '40px Arial';
                ctx.fillStyle = 'white';
                ctx.fillText(`"${name}" #${print} ~${codeToView})`, 20, canvas.height - 30);

                const buffer = canvas.toBuffer();

                // Send the image to the user
                msg.reply({ files: [buffer] });
              }
            }
          });
        }
      }
    });
  } else if (msg.content.startsWith('mremove')) {
    const userId = msg.author.id;
    const codeToRemove = msg.content.slice('mremove'.length).trim();
  
    // Check if the user exists in the players table
    const checkUserQuery = 'SELECT * FROM players WHERE user_id = ?';
    const checkUserValues = [userId];
  
    connection.query(checkUserQuery, checkUserValues, (err, userResults) => {
      if (err) {
        console.error('Error checking user in database:', err.message);
      } else {
        if (userResults.length === 0) {
          // User does not exist, inform them to use the !register command
          msg.reply('You need to register first! Use the command `mregister`.');
        } else {
          // User exists, check if a card with the given code exists in their inventory
          const checkCardQuery = 'SELECT * FROM card_inventory WHERE user_id = ? AND card_code = ?';
          const checkCardValues = [userId, codeToRemove];
  
          connection.query(checkCardQuery, checkCardValues, async (cardErr, cardResults) => {
            if (cardErr) {
              console.error('Error checking card in database:', cardErr.message);
            } else {
              if (cardResults.length === 0) {
                msg.reply(`Card with code ${codeToRemove} not found in your inventory.`);
              } else {
                // Card found, delete it from the database
                const deleteCardQuery = 'DELETE FROM card_inventory WHERE user_id = ? AND card_code = ?';
                const deleteCardValues = [userId, codeToRemove];
  
                connection.query(deleteCardQuery, deleteCardValues, async (deleteErr, deleteResults) => {
                  if (deleteErr) {
                    console.error('Error deleting card from the database:', deleteErr.message);
                  } else {
                    console.log('Card deleted from the database:', deleteResults);
  
                    // Add items to the user_items table
                    await addItemsToUser(userId);
  
                    msg.reply(`Card with code ${codeToRemove} has been removed from your inventory, and you received items.`);
                  }
                });
              }
            }
          });
        }
      }
    });
  } else if (msg.content === 'mitems') {
    const userId = msg.author.id;
  
    // Fetch items from user_items table
    const fetchItemsQuery = 'SELECT * FROM user_items WHERE user_id = ?';
    const fetchItemsValues = [userId];
  
    connection.query(fetchItemsQuery, fetchItemsValues, (fetchErr, fetchResults) => {
      if (fetchErr) {
        console.error('Error fetching items from the database:', fetchErr.message);
      } else {
        if (fetchResults.length === 0) {
          msg.reply('You have no items in your inventory.');
        } else {
          // Build an embedded message with items and emojis
          const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${msg.author.username}'s Inventory`)
            .setDescription('Here are your items:')
            .addFields(
              fetchResults.map((item) => ({
                name: `${itemEmojis[item.item_type] || '❓'} ${item.item_type}`,
                value: `Amount: ${item.item_amount}`,
                inline: true,
              }))
            )
          
          msg.reply({ embeds: [embed] });
        }
      }
    });
  } else if (msg.content === 'mshop') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Shop')
      .setDescription('Welcome to the shop! Here is our current offer:')
      .addFields(
        Object.entries(itemPrices).map(([item, price]) => ({
          name: `${itemEmojis[item] || '❓'} ${item}`,
          value: `Price: ${price} coins`,
          inline: true,
        }))
      )
      .setImage('https://i.imgur.com/cIYuiG2.jpeg') // Dodaj ikonę sklepu
      .setFooter({text:'Happy shopping!'})
      .setTimestamp();
  
    msg.reply({ embeds: [embed] });
  } else if (msg.content.startsWith('mbuy')) {
    const args = msg.content.split(' ');
    if (args.length !== 2) {
      return msg.reply('Invalid command. Usage: mbuy <item_name>');
    }

    const itemName = args[1].toLowerCase();
    const item = shopItems[itemName];

    if (!item) {
      return msg.reply('Invalid item. Check available items using mshop.');
    }

    // Assuming you have a function to get user data from the database
    const userData = await getUserData(msg.author.id);

    // Check if the user has enough coins or common tickets to make the purchase
    if (item.cost > userData.coins) {
      return msg.reply('You don\'t have enough coins to buy this item.');
    }

    if (item.itemType === 'scroll' && item.cost > userData.common_tickets) {
      return msg.reply('You don\'t have enough common tickets to buy this item.');
    }

    // Deduct the cost from the user's inventory
    await deductItemFromInventory(msg.author.id, 'coins', item.cost);
    if (item.itemType === 'scroll') {
      await deductItemFromInventory(msg.author.id, 'common_tickets', 1); // Deduct 1 common ticket
    }

    // Add the item to the user's inventory
    await addItemToInventory(msg.author.id, item.itemType, 1);

    msg.reply(`You have successfully bought ${itemName}!`);
  } else if (msg.content.toLowerCase() === 'mscroll') {
    // Check if the user has scrolls
    const userId = msg.author.id;
    const scrollAmount = await getUserItemsAmount(userId, 'scroll');

    if (scrollAmount < 1) {
      msg.reply('You don\'t have any scrolls.');
      return;
    }

    // Generate a random color
    const randomColor = getRandomColor();

    // Create a canvas with a colored square
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = randomColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Convert canvas to buffer
    const buffer = canvas.toBuffer('image/png');

    // Send the buffer as an attachment
    msg.reply({
      files: [{
        attachment: buffer,
        name: 'color.png',
      }],
    });

    // Update user's inventory (subtract 1 scroll)
    await updateUserItemsAmount(userId, 'scroll', scrollAmount - 1);
  } else if (msg.content.startsWith('mcardinfo')) {
    const cardCode = msg.content.split(' ')[1];
    if (!cardCode) {
      msg.reply('Please provide a card code.');
      return;
    }
  
    const userId = msg.author.id;
  
    // Fetch card information and statistics from the database
    const query = `
    SELECT ci.*, cs.*
    FROM card_inventory ci
    LEFT JOIN card_stats cs ON ci.card_code = cs.card_code
    WHERE ci.user_id = ? AND ci.card_code = ?
    `;
    const values = [userId, cardCode];
  
    connection.query(query, values, (err, results) => {
      if (err) {
        console.error('Error fetching card info from database:', err.message);
        msg.reply('An error occurred while fetching card info.');
      } else {
        if (results.length === 0) {
          msg.reply('You do not own a card with that code.');
        } else {
          const cardInfo = results[0];
          const embed = createCardInfoEmbed(cardInfo);
          msg.reply({ embeds: [embed] });
        }
      }
    });
  }
  
  
  
});

function generateSpecialAbility(element, baseElement) {
  const emojiMap = {
    fire: '🔥',
    earth: '🗿',
    water: '💧',
    metal: '⚙️',
  };

  const abilities = {
    [`${emojiMap.fire}_${emojiMap.earth}`]: { name: 'Cinderclad Rupture', description: `Summons a localized volcanic fissure beneath a targeted enemy, dealing a moderate 70% hybrid damage of ${emojiMap.earth} or ${emojiMap.fire}. Has a 90% chance of creating a "Smouldering" debuff, which persists for 2 turns, causing 10% DOT ${emojiMap.fire} damage to the enemy for 1 turn.` },
    [`${emojiMap.fire}_${emojiMap.water}`]: { name: 'Mistral Confluence', description: `Weaves a plume of steam directed at a single enemy, dealing 80% hybrid damage upon impact. Has a 90% chance of causing a "Blurred Haze" status effect, which decreases the target's damage by 10% for their next turn.` },
    [`${emojiMap.fire}_${emojiMap.metal}`]: { name: 'Ferric Blaze', description: `Hurls a molten metal shard at a single target, dealing precise 65% hybrid damage. Has an 85% chance to embed metal poison in the target, reducing their defense by 5% and causing a "Metallic Sear" for 2 turns, inflicting 5% DOT ${emojiMap.metal} damage each turn.` },
    [`${emojiMap.earth}_${emojiMap.water}`]: { name: 'Mudslide', description: `Generates a torrent of mud at a target location within a 2-block radius, ensnaring enemies with 90% hybrid damage. The thick sludge slows down the enemy movement by 20% for the next turn.` },
    [`${emojiMap.earth}_${emojiMap.metal}`]: { name: 'Sharp Pebble', description: `Targets 2 block enemies, causing a 50% hybrid damage. Has a 100% chance to stun enemies for 2 turns.` },
    [`${emojiMap.water}_${emojiMap.metal}`]: { name: 'Razor Torrent', description: `Sends forth a jet of water at high velocity towards a single enemy, inflicting 85% hybrid damage. Decreases the target's defense by 8% for 3 turns.` },
    // Dodaj pozostałe kombinacje z emoji
    [`${emojiMap.earth}_${emojiMap.fire}`]: { name: 'Cinderclad Rupture', description: `Summons a localized volcanic fissure beneath a targeted enemy, dealing a moderate 70% hybrid damage of ${emojiMap.earth} or ${emojiMap.fire}. Has a 90% chance of creating a "Smouldering" debuff, which persists for 2 turns, causing 10% DOT ${emojiMap.fire} damage to the enemy for 1 turn.` },
    [`${emojiMap.water}_${emojiMap.fire}`]: { name: 'Mistral Confluence', description: `Weaves a plume of steam directed at a single enemy, dealing 80% hybrid damage upon impact. Has a 90% chance of causing a "Blurred Haze" status effect, which decreases the target's damage by 10% for their next turn.` },
    [`${emojiMap.metal}_${emojiMap.fire}`]: { name: 'Ferric Blaze', description: `Hurls a molten metal shard at a single target, dealing precise 65% hybrid damage. Has an 85% chance to embed metal poison in the target, reducing their defense by 5% and causing a "Metallic Sear" for 2 turns, inflicting 5% DOT ${emojiMap.metal} damage each turn.` },
    [`${emojiMap.water}_${emojiMap.earth}`]: { name: 'Mudslide', description: `Generates a torrent of mud at a target location within a 2-block radius, ensnaring enemies with 90% hybrid damage. The thick sludge slows down the enemy movement by 20% for the next turn.` },
    [`${emojiMap.metal}_${emojiMap.earth}`]: { name: 'Sharp Pebble', description: `Targets 2 block enemies, causing a 50% hybrid damage. Has a 100% chance to stun enemies for 2 turns.` },
    [`${emojiMap.metal}_${emojiMap.water}`]: { name: 'Razor Torrent', description: `Sends forth a jet of water at high velocity towards a single enemy, inflicting 85% hybrid damage. Decreases the target's defense by 8% for 3 turns.` },
  };

  const key = `${element}_${baseElement}`;
  return abilities[key] || { name: 'No special ability', description: 'Your card has 2 same elements, it\'s nothing special, give up on your dream and die' };
}






function createCardInfoEmbed(cardInfo) {
  // Emoji representations for statistics
  const emojiMap = {
    strength: '💪',
    defense: '🛡️',
    agility: '🏃',
    wisdom: '🧠',
    energy: '⚡',
    luck: '🍀',
  };

  const centeredTitle = `**    ${cardInfo.card_name}** \u2022 ${cardInfo.series || 'N/A'}`;

  const specialAbility = generateSpecialAbility(cardInfo.element, cardInfo.base_element);
  const abilityValue = `**Name:** ${specialAbility.name}\n**Description:** ${specialAbility.description}`;

  return {
    color: 0x0099ff,
    title: centeredTitle,
    fields: [
      { name: 'Elements', value: `${cardInfo.element || 'N/A'} \u2022 ${cardInfo.base_element || 'N/A'}` },
      {
        name: 'Stats',
        value: `**STR:** ${
          cardInfo.strength !== null ? cardInfo.strength + emojiMap.strength : 'N/A'
        } | **DEF:** ${
          cardInfo.defense !== null ? cardInfo.defense + emojiMap.defense : 'N/A'
        } | **AGI:** ${
          cardInfo.agility !== null ? cardInfo.agility + emojiMap.agility : 'N/A'
        } | **WIS:** ${
          cardInfo.wisdom !== null ? cardInfo.wisdom + emojiMap.wisdom : 'N/A'
        } | **ENG:** ${
          cardInfo.energy !== null ? cardInfo.energy + emojiMap.energy : 'N/A'
        } | **LCK:** ${
          cardInfo.luck !== null ? cardInfo.luck + emojiMap.luck : 'N/A'
        }`,
      },
      { name: 'Special Ability', value: abilityValue },
    ],
    image: { url: cardInfo.card_url },
    footer: { text: 'Legend: STR (Strength), DEF (Defense), AGI (Agility), WIS (Wisdom), ENG (Energy), LCK (Luck)' },
  };
}

function getEmojiForElement(element) {
  switch (element) {
    case 'fire':
      return '🔥';
    case 'earth':
      return '🗿';
    case 'water':
      return '💧';
    case 'metal':
      return '⚙️';
    default:
      return '';
  }
}

async function getUserItemsAmount(userId, itemType) {
  return new Promise((resolve, reject) => {
    connection.query('SELECT item_amount FROM user_items WHERE user_id = ? AND item_type = ?', [userId, itemType], (err, results) => {
      if (err) {
        reject(err);
      } else {
        const itemAmount = results.length > 0 ? results[0].item_amount : 0;
        resolve(itemAmount);
      }
    });
  });
}

function getRandomElementWithChances(elements, chances) {
  const totalChances = chances.reduce((acc, chance) => acc + chance, 0);
  const randomNum = Math.floor(Math.random() * totalChances);
  
  let cumulativeChances = 0;
  for (let i = 0; i < elements.length; i++) {
      cumulativeChances += chances[i];
      if (randomNum < cumulativeChances) {
          return elements[i];
      }
  }

  // W razie jakiegoś błędu zwróć domyślny element
  return elements[0];
}

function addCardInfoToDatabase(cardName, latestPrint) {
  const query = 'INSERT INTO card_info (card_name, latest_print) VALUES (?, ?)';
  const values = [cardName, latestPrint];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error adding card info to database:', err.message);
    } else {
      console.log('Card info added to database:', results);
    }
  });
}

async function updateUserItemsAmount(userId, itemType, newAmount) {
  return new Promise((resolve, reject) => {
    connection.query('INSERT INTO user_items (user_id, item_type, item_amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE item_amount = VALUES(item_amount)', [userId, itemType, newAmount], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

async function removeUserItems(userId, itemType, amount) {
  return new Promise((resolve, reject) => {
    const query = 'UPDATE user_items SET item_amount = item_amount - ? WHERE user_id = ? AND item_type = ? AND item_amount >= ?';
    const values = [amount, userId, itemType, amount];

    connection.query(query, values, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

// Function to generate a random color in hex format
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

async function getUserData(userId) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM user_items WHERE user_id = ?';
    connection.query(query, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        const userData = {};
        results.forEach((row) => {
          userData[row.item_type] = row.item_amount;
        });
        resolve(userData);
      }
    });
  });
}

async function deductItemFromInventory(userId, itemType, amount) {
  return new Promise((resolve, reject) => {
    const query = 'UPDATE user_items SET item_amount = item_amount - ? WHERE user_id = ? AND item_type = ?';
    connection.query(query, [amount, userId, itemType], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

async function addItemToInventory(userId, itemType, amount) {
  return new Promise((resolve, reject) => {
    const query = 'INSERT INTO user_items (user_id, item_type, item_amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE item_amount = item_amount + VALUES(item_amount)';
    connection.query(query, [userId, itemType, amount], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

// Function to add items to the user_items table
async function addItemsToUser(userId) {
  const coinsAmount = Math.floor(Math.random() * (50 - 10 + 1)) + 10;
  const commonTicketAmount = Math.random() < 0.5 ? 1 : 0; // 50% chance of getting a common ticket

  // Update coins in user_items
  const updateCoinsQuery = 'INSERT INTO user_items (user_id, item_type, item_amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE item_amount = item_amount + VALUES(item_amount)';
  const updateCoinsValues = [userId, 'coins', coinsAmount];

  // Update common ticket in user_items
  const updateCommonTicketQuery = 'INSERT INTO user_items (user_id, item_type, item_amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE item_amount = item_amount + VALUES(item_amount)';
  const updateCommonTicketValues = [userId, 'common_ticket', commonTicketAmount];

  connection.query(updateCoinsQuery, updateCoinsValues, (coinsErr, coinsResults) => {
    if (coinsErr) {
      console.error('Error updating coins in user_items:', coinsErr.message);
    } else {
      console.log('Coins updated in user_items:', coinsResults);
    }
  });

  connection.query(updateCommonTicketQuery, updateCommonTicketValues, (ticketErr, ticketResults) => {
    if (ticketErr) {
      console.error('Error updating common ticket in user_items:', ticketErr.message);
    } else {
      console.log('Common ticket updated in user_items:', ticketResults);
    }
  });
}

// Start of functions
const getRandomImages = () => {
    const selectedImages = [];

    while (selectedImages.length < 3) {
      const randomImage = imageUrls[Math.floor(Math.random() * imageUrls.length)];

      if (!selectedImages.some((image) => image.name === randomImage.name)) {
        selectedImages.push(randomImage);
      }
    }

    return selectedImages;
  };

function saveUpdatedImageUrls() {
  try {
    // Save the images to the file
    fs.writeFileSync(imageUrlsPath, JSON.stringify(imageUrls, null, 2));
    console.log('ImageUrls updated successfully.');
  } catch (error) {
    console.error('Error saving updated imageUrls:', error.message);
  }
}

function addPlayerToDatabase(userId, username) {
  const query = 'INSERT INTO players (user_id, username) VALUES (?, ?)';
  const values = [userId, username];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error adding player to database:', err.message);
    } else {
      console.log('Player added to database:', results);
    }
  });
}

function getRandomNumberInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function addCardToDatabase(userId, cardName, cardUrl, cardPrint, cardCode, series, element, baseElement) {
  // Find the image object with the matching name in imageUrls
  const imageObject = imageUrls.find((image) => image.name === cardName);

  // Check if the image object and its series property exist
  series = imageObject && imageObject.series ? imageObject.series : 'default_series';

  const elements = ['🔥', '🗿', '💧', '⚙️'];

  // Randomly choose an element with specified chances
  const randomElement = getRandomElementWithChances(elements, [30, 30, 30, 10]);

  // Randomly generate statistics
  const strength = getRandomNumberInRange(10, 100);
  const defense = getRandomNumberInRange(5, 50);
  const agility = getRandomNumberInRange(5, 30);
  const wisdom = getRandomNumberInRange(1, 20);
  const energy = getRandomNumberInRange(10, 50);
  const luck = getRandomNumberInRange(1, 10);

  const queryInventory = 'INSERT INTO card_inventory (user_id, card_name, card_url, card_print, card_code, series, element, base_element, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())';
  const valuesInventory = [userId, cardName, cardUrl, cardPrint, cardCode, series, element, baseElement];

  const queryStats = 'INSERT INTO card_stats (card_code, strength, defense, agility, wisdom, energy, luck) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const valuesStats = [cardCode, strength, defense, agility, wisdom, energy, luck];

  // Insert into card_inventory
  connection.query(queryInventory, valuesInventory, async (err, results) => {
    if (err) {
      console.error('Error adding card to database:', err.message);
    } else {
      console.log('Card added to database:', results);

      // Insert into card_stats
      connection.query(queryStats, valuesStats, (statsErr) => {
        if (statsErr) {
          console.error('Error adding stats to database:', statsErr.message);
        }
      });
    }
  });
}





async function deleteOldCodes() {
  return new Promise((resolve, reject) => {
    // Get the maximum ID
    connection.query('SELECT MAX(id) AS maxId FROM last_code_table', (maxIdErr, maxIdResults) => {
      if (maxIdErr) {
        console.error('Error fetching maximum ID from the database:', maxIdErr.message);
        reject(maxIdErr);
      } else {
        const maxId = maxIdResults[0].maxId || 0;

        // Determine the minimum ID to keep
        const minIdToKeep = Math.max(1, maxId - 2); // Assuming we want to keep the last 2 codes

        // Delete codes with IDs lower than minIdToKeep
        connection.query('DELETE FROM last_code_table WHERE id < ?', [minIdToKeep], (deleteErr, deleteResults) => {
          if (deleteErr) {
            console.error('Error deleting old codes from the database:', deleteErr.message);
            reject(deleteErr);
          } else {
            //console.log('Old codes successfully deleted from the database:', deleteResults);
            resolve();
          }
        });
      }
    });
  });
}
async function generateUniqueCode() {
    return new Promise((resolve, reject) => {
      const codeCharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let codeLength = 3;
      let code;
  
      if (!existingCodes[codeLength]) {
        existingCodes[codeLength] = {};
      }
  
      // Use the last generated code if available
      if (lastGeneratedCode) {
        code = lastGeneratedCode;
        lastGeneratedCode = ''; // Reset so that the next code will be generated normally
        resolve(code);
      } else {
        // Fetch the latest code from the database
        connection.query('SELECT * FROM last_code_table ORDER BY id DESC LIMIT 1', (fetchErr, fetchResults) => {
          if (fetchErr) {
            console.error('Error fetching last code from the database:', fetchErr.message);
            reject(fetchErr);
          } else {
            const latestCode = fetchResults[0]?.last_generated_code || '';
            let nextCode;
  
            // Generate the next code based on the latest code
            do {
              if (Object.keys(existingCodes[codeLength]).length >= codeCharacters.length ** codeLength) {
                codeLength++;
                existingCodes[codeLength] = {};
              }
              const base36Count = Object.keys(existingCodes[codeLength]).length.toString(36);
              nextCode = (parseInt(latestCode, 36) + 1).toString(36).padStart(codeLength, '0');
            } while (existingCodes[codeLength][nextCode]);
  
            existingCodes[codeLength][nextCode] = true;
  
            // Save the current code to the database for future use
            connection.query('INSERT INTO last_code_table (last_generated_code) VALUES (?)', [nextCode], async (err, results) => {
              if (err) {
                console.error('Error inserting the newly generated code into the database:', err.message);
                reject(err);
              } else {
                //console.log('The newly generated code has been successfully inserted into the database:', results);
                // Remove old codes from the database after adding three new codes
                await deleteOldCodes();
                resolve(nextCode);
              }
            });
          }
        });
      }
    });
}

// Bot login
client.login(process.env.TOKEN);
// Import
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Discord = require('discord.js');
const { Interaction } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const mysql = require('mysql2');
const util = require('util');
const imageUrlsPath = './imageUrls.json';
const characters = require('./imageUrls.json');
const jsonFilePath = './moderators.json';
const allowedUserId = '556469452003344384';
const moderators = require('./moderators.json');

// dotenv
require('dotenv').config();

// Variables
let player1CardCodes = [];
let player2CardCodes = [];
let lockClicks = 0;
let lastTradeAuthor = '';
let requester;
let tradeRequestHandled = false;
let lastCommandAuthor;
let provideItemsMessage= null;
const debugUserId = '556469452003344384';
let tradeMessage;
const globalData = {
  cardName0:null,
  cardSeries0:null
};
let description_;
const sharedData = {};
const cardsPerPage = 10;
let currentPage = 1;
let inventoryMessage = null;
const guildId = '1203697950111436862';
const serverChannelId ='1203700143397011536';
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
    GatewayIntentBits.GuildMembers,
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
    const elements = ['🔥', '🗿', '💧', '⚙️', '⚡', '🌬️', '💥', '🌑', '💡', '🥊', '🛡️']; // Dodane


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
    

      const element = getRandomElementWithChances(elements, [9.5,9.5,9.5,9.5,9.5,9.5,5,9.5,9.5,9.5,9.5]); // Dodane
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
                  await interaction.channel.send(`<@${interaction.user.id}> "${cardName}" #${cardPrint} \`${cardCode}\` from \`${series}\` of ${element} element has been added to your inventory!\nBase Element: ${cardData.baseElement}`);
    
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
      const validBaseElements = ['🔥', '🗿', '💧', '⚙️', '⚡', '🌬️', '💥', '🌑', '💡', '🥊', '🛡️'];
      if (!validBaseElements.includes(baseElement)) {
        msg.reply('Invalid base element emoji. Please use one of the following: 🔥, 🗿, 💧, ⚙️, ⚡, 🌬️, 💥, 🌑, 💡, 🥊, 🛡️');
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
      msg.reply('Invalid command format. Use !addimage <name> <url> <series> <🔥or🗿or💧or⚙️or⚡️or🌬️or💥or🌑or💡or🥊or🛡️>.');
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
        if (interaction.customId === buttonLeftId||interaction.user.id == msg.author.id) {
            // Acknowledge the interaction
            interaction.deferred ? interaction.editReply('') : interaction.deferUpdate();
            sendInventory(currentPage - 1);
        }

        // Handle Right button
        if (interaction.customId === buttonRightId||interaction.user.id == msg.author.id) {
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
        { name: 'mhelp', value: 'Display this help message.', inline: true },
        { name: 'mview <code>', value: 'View a card by its code.', inline: true },
        { name: 'mremove <code>', value: 'Remove a card by its code.', inline: true },
        { name: 'mitems', value: 'View all items in your inventory.', inline: true },
        { name: 'mbuy <item>', value: 'Buy an item from the shop.', inline: true },
        { name: 'mshop', value: 'Show shop offerings',inline: true },
        { name: 'mscroll', value: 'Open scroll (containing random color)',inline: true },
        { name: 'mcardinfo <code>', value: 'Showing card statictics like element assigned special ability',inline: true},
        { name: 'msearch <card_name>', value: 'Searching for existing card in card pool - NOTE: name no need to be full, command ill show 10 cards closest for search name.', inline: true },
        { name: 'mdamage', value: 'Showing damage formula',inline:true},
        { name: 'madddescription', value:'Send description u wanna add for card, It ill be added if moderator ill approve it',inline:true},
        { name:'\u200B',value:'\u200B'},
        { name: 'maddimage <name> <url> <series> <element_emoji>', value: 'Add a new image to the card pool (admin only).', inline: true },
        { name: 'maddmoderator', value: 'Adding moderator (admin only)',inline: true },
        
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
  } else if (msg.content.startsWith('maddmoderator')) {
    // Sprawdź, czy osoba wykonująca komendę ma odpowiednie uprawnienia
    if (msg.author.id !== allowedUserId) {
      msg.reply('You do not have permission to use this command.');
      return;
    }

    const args = msg.content.slice('maddmoderator'.length).trim().split(' ');

    if (args.length === 2) {
      const discordId = args[0];
      const discordUsertag = args[1];

      // Odczytaj istniejącą zawartość pliku JSON
      let moderatorsData;
      try {
        moderatorsData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
      } catch (error) {
        console.error('Error reading JSON file:', error.message);
        moderatorsData = [];
      }

      // Sprawdź, czy istnieje już wpis o tym ID Discorda
      const existingModerator = moderatorsData.find((moderator) => moderator.id === discordId);

      if (!existingModerator) {
        // Dodaj nowego moderatora
        moderatorsData.push({ id: discordId, usertag: discordUsertag });

        // Zapisz zmiany do pliku JSON
        fs.writeFileSync(jsonFilePath, JSON.stringify(moderatorsData, null, 2));

        msg.reply(`Moderator added successfully: ${discordUsertag} (${discordId}).`);
      } else {
        msg.reply(`Moderator with ID ${discordId} already exists.`);
      }
    } else {
      msg.reply('Invalid command format. Use !maddmoderator <discord_id> <discord_usertag>.');
    }
  } else if (msg.content.startsWith('msearch')) {
    // Sprawdź, czy treść wiadomości zawiera przynajmniej jedno słowo po komendzie
    const args = msg.content.slice('msearch'.length).trim().split(' ');

    if (args.length < 1) {
        msg.reply('Please provide a character name.');
        return;
    }

    // Pobierz frazę wyszukiwania z treści wiadomości
    const searchTerm = args.join(' ');

    // Sprawdź, czy istnieje co najmniej jedna postać
    if (characters.length === 0) {
        msg.reply('No characters found.');
        return;
    }

    // Utwórz wyrażenie regularne do wyszukiwania nazwy postaci
    const regex = new RegExp(searchTerm, 'i');

    // Filtruj postacie, których nazwa pasuje do wprowadzonej frazy
    const filteredCharacters = characters.filter(
        (char) => char.name && regex.test(char.name.trim())
    );

    if (filteredCharacters.length === 0) {
        msg.reply('No characters found.');
    } else {
        const slicedCharacters = filteredCharacters.slice(0, 10);

        // Jeżeli jest jedna pasująca postać, wyślij Embed
        if (slicedCharacters.length === 1) {
            const character = slicedCharacters[0];

            // Tworzymy Embed
            const embed = new EmbedBuilder()
                .setTitle('Selected Character')
                .setDescription(`**Name:** ${character.name}\n**Series:** ${character.series}\n**Base Element:** ${character.baseElement}`)
                .setImage(character.url);

            // Dodaj opis, jeśli dostępny
            if (character.description) {
                embed.setDescription(`**Name:** ${character.name}\n**Series:** ${character.series}\n**Base Element:** ${character.baseElement}\n\n**Description:** ${character.description}`);
            } else {
                embed.addFields({ name: 'Description', value: 'No description available.' });
            }

            // Wysyłamy Embed
            msg.reply({ embeds: [embed] });
        } else {
            // Jeżeli jest więcej niż jedna pasująca postać, wyślij listę z numerami
            const characterList = slicedCharacters.map(
                (char, index) => `${index + 1}. ${char.name} from ${char.series}`
            );

            // Wyślij listę postaci
            msg.reply(`Multiple characters found. Please choose a number:\n${characterList.join('\n')}`);

            // Utwórz kolektor reakcji
            const collector = msg.channel.createMessageCollector({
                filter: (response) => response.author.id === msg.author.id && /^\d+$/.test(response.content),
                time: 15000,
                max: 1,
            });

            collector.on('collect', (response) => {
                const choice = parseInt(response.content) - 1;
                const selectedCharacter = slicedCharacters[choice];

                // Tworzymy Embed
                const embed = new EmbedBuilder()
                    .setTitle('Selected Character')
                    .setDescription(`**Name:** ${selectedCharacter.name}\n**Series:** ${selectedCharacter.series}\n**Base Element:** ${selectedCharacter.baseElement}`)
                    .setImage(selectedCharacter.url);

                // Dodaj opis, jeśli dostępny
                if (selectedCharacter.description) {
                    embed.setDescription(`**Name:** ${selectedCharacter.name}\n**Series:** ${selectedCharacter.series}\n**Base Element:** ${selectedCharacter.baseElement}\n\n**Description:** ${selectedCharacter.description}`);
                } else {
                    embed.addFields({ name: 'Description', value: 'No description available.' });
                }

                // Wysyłamy Embed
                msg.reply({ embeds: [embed] });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    msg.reply('Time ran out. No character selected.');
                }
            });
        }
    }
  } else if (msg.content.startsWith('madddescription')) {
    const usertag = msg.author.tag;
    const userId = msg.author.id;
    const channel_ = msg.channel.id;
    const serverChannel_ = msg.guild.channels.cache.get(channel_);

    // Sprawdź, czy wprowadzono poprawną liczbę argumentów
    const args = msg.content.slice('madddescription'.length).trim().split(' ');

    console.log('Debug info:');
    console.log('Arguments:', args);

    if (args.length < 2) {
        msg.reply('Please provide the correct number of arguments: <card_name> <card_series>');
        return;
    }
    if (msg.guild && msg.guild.id !== guildId) {
        msg.reply('This command is restricted to a specific server.');
        return;
    }
    const cardName = args[0].toLowerCase();
    const cardSeries = args.slice(1).join(' ').toLowerCase();
    
    let matchedCharacters = [];
    let names1 = null;

    for (let i = 0; i < characters.length; i++) {
      const characterName = characters[i].name.toLowerCase();
      const characterSeries = characters[i].series.toLowerCase();
  
      if (cardName === characterName && characterSeries.includes(cardSeries)) {
          matchedCharacters.push(characters[i]);
  
          // Przypisz bezpośrednio do globalData, aby uniknąć problemów z names1
          globalData.cardName0 = characters[i].name.toLowerCase();
          globalData.cardSeries0 = characters[i].series.toLowerCase();
      }
  }

    if (matchedCharacters.length === 0) {
        msg.reply('No matching characters found. Please check your input.');
        return;
    }

    // Display matched characters in the confirmation message
    const matchedCharactersList = matchedCharacters
        .map((char) => `${char.name} from ${char.series}`)
        .join('\n');

        const confirmationEmbed = new EmbedBuilder()
        .setTitle(`Is this the character to which you want to add a description?`)
        .setDescription(`***${matchedCharactersList}*** \n If yes, you have 1 minute to send a description as next message. If the character does not match, type "no" and use the command again.`)
        .setColor('#3498db');
    
    msg.channel.send({ embeds: [confirmationEmbed] });
    
    // Oczekuj na odpowiedź od użytkownika
    const filter = (response) => response.author.id === msg.author.id;
    const collector = msg.channel.createMessageCollector({filter: filter,  time: 60000 });
    
    const foundCard = characters.find((card) => {
      const isCardNameMatch = card.name.toLowerCase() === cardName.toLowerCase();
      const isSeriesMatch = card.series && card.series.toLowerCase().includes(cardSeries);
    
      return isCardNameMatch && isSeriesMatch;
  });


    collector.on('collect', (response) => {
        userResponse = response.content.trim();
    
        // Check if the message is sent by the bot
        if (response.author.bot) {
            return;
        }
    
        
    
        if (!foundCard) {
            msg.reply('The specified card does not exist.');
            return;
        }
    
        // Sprawdź, czy opis dla danej karty już istnieje
        const existingDescription = foundCard.description;
    
        if (existingDescription) {
            msg.reply('Description already exists for the specified card.');
            return;
        }

        // Sprawdź, czy użytkownik już dodał opis tej karty
        const existingRequestQuery = 'SELECT * FROM user_data WHERE user_id = ? AND card_name = ? AND channel_id = ?';
        connection.query(existingRequestQuery, [userId, names1, channel_], (requestErr, requestResults) => {
            if (requestErr) {
                console.error('Error checking existing description request:', requestErr.message);
                return;
            }

            /*if (requestResults.length > 0) {
                msg.reply('You have already requested a description for this card. Please wait for the admin to review.');
                return;
            }*/
            // Jeżeli użytkownik nie chce dodawać opisu
            if (userResponse.toLowerCase() === 'no') {
                msg.reply('Adding description canceled.');
                collector.stop();
                return;
            } else if (userResponse.length < 20) {
                msg.reply('Description is too short!');
                return;
            } else if (userResponse.length >= 20) {
                // Jeżeli użytkownik wysłał opis (minimum 20 znaków), wyślij na określony kanał
                const serverChannel = msg.guild.channels.cache.get(serverChannelId);

                if (serverChannel) {
                    const descriptionEmbed = new EmbedBuilder()
                        .setTitle('New Description Request')
                        .addFields(
                            { name: 'User', value: msg.author.tag, inline: true },
                            { name: 'Character', value: foundCard.name, inline: true },
                            { name: 'Series', value: foundCard.series, inline: true },
                            { name: 'Description', value: userResponse }
                        )
                        .setTimestamp()
                        .setColor('#2ecc71');

                    const confirm = new ButtonBuilder()
                        .setCustomId('confirm')
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Success);

                    const cancel = new ButtonBuilder()
                        .setCustomId('cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger);

                    const row = new ActionRowBuilder()
                        .addComponents(cancel, confirm);

                    // Check if the user response has content
                    if (userResponse.trim() !== '') {
                        //descriptionEmbed.setDescription(userResponse);
                        description_ = userResponse;
                        serverChannel.send({
                            embeds: [descriptionEmbed],
                            components: [row]
                        })
                            .then(() => {
                                msg.reply('Description request sent successfully! Wait for an admin to accept or decline it!');
                            })
                            .catch((error) => {
                                console.error('Error sending message:', error);
                                msg.reply(`An error occurred while adding the description: ${error.message}`);
                            });
                    } else {
                        msg.reply('Description cannot be empty. Adding description canceled.');
                    }
                } else {
                    msg.reply('Server channel not found. Please configure the server channel ID in the bot configuration.');
                }
                console.log(`desc:${description_}`)
                // Store data in the database
                const storeDataQuery = 'INSERT INTO user_data (user_id, channel_id, card_name, usertag, description) VALUES (?, ?, ?, ?, ?)';
    connection.query(storeDataQuery, [userId, channel_, names1, usertag, description_], (storeErr) => {
        if (storeErr) {
            console.error('Error storing user data in the database:', storeErr.message);
            return;
        }
        // Add the description to the character in the characters array
    foundCard.description = description_;

    // Optionally, update the 'imageUrls.json' file with the modified characters array
    fs.writeFileSync('imageUrls.json', JSON.stringify(characters, null, 2));
    });
                collector.stop();
            }
        });
    });
    
    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            msg.reply('Command timed out. Please try again.');
        }
    });
    
  } else if (msg.content.toLowerCase().startsWith('mtrade')) {
    const partialUsername = msg.content.slice('mtrade'.length).trim();

    if (!partialUsername) {
        return msg.reply('Please provide a username.');
    }

    await msg.guild.members.fetch();

    let mostSimilarUsername = null;

    msg.guild.members.cache.forEach(member => {
        if (!member.user.bot && member.id !== msg.author.id) {
            const username = member.user.username.toLowerCase();
            const nickname = member.displayName ? member.displayName.toLowerCase() : null;
            const displayName = member.nickname ? member.nickname.toLowerCase() : member.user.username.toLowerCase();
            if (nickname && nickname.startsWith(partialUsername.toLowerCase())) {
                mostSimilarUsername = member.displayName;
            } else if (username.startsWith(partialUsername.toLowerCase())) {
                mostSimilarUsername = member.user.username;
            } else if (displayName.startsWith(partialUsername.toLowerCase())) {
                mostSimilarUsername = member.displayName ? member.displayName : member.user.username;
            }
        }
    });

    if (!mostSimilarUsername) {
        return msg.reply(`No similar username found for "${partialUsername}".`);
    }

    const commandAuthor = msg.author.username; // Nazwa gracza, który użył komendy
    console.log(mostSimilarUsername)
    const tradeEmbed = new EmbedBuilder()
        .setColor('#778899') // Szary kolor dla początkowej wiadomości o handlu
        .setTitle('Trade Request')
        //.setDescription(`Do you want to accept trade with ${mostSimilarUsername.toString()}?`)
        .setTimestamp();
        const user = msg.guild.members.cache.find(member => member.user.username === mostSimilarUsername);
        const tradeTarget = msg.guild.members.cache.find(member => member.displayName === mostSimilarUsername);
        if (tradeTarget) {
          
            const tradeTargetTag = tradeTarget.toString(); // Formatuje obiekt użytkownika do postaci pingu
            tradeEmbed.setDescription(`${tradeTargetTag} do you want to trade with <@${msg.author.id}>?`);
        } else {
          const userID = user.user.id;
            tradeEmbed.setDescription(`<@${userID}> do you want to trade with <@${msg.author.id}>?`);
        }

    if (lastTradeAuthor === msg.author.username) {
        if (tradeMessage && !tradeMessage.deleted) {
            await tradeMessage.delete().catch(console.error);
        }
        if (provideItemsMessage && !provideItemsMessage.deleted) {
            await provideItemsMessage.delete().catch(console.error);
        }
    } 

    tradeMessage = await msg.channel.send({ embeds: [tradeEmbed] }).catch(console.error);

    await tradeMessage.react('✅');
    const declineReaction = await tradeMessage.react('❌');

    // Obsługa reakcji
    

    // Obsługa reakcji na akceptację
    const filterAccept = (reaction, user) => reaction.emoji.name === '✅' && (user.username === mostSimilarUsername || user.id === debugUserId);
    const acceptCollector = tradeMessage.createReactionCollector({ filter: filterAccept, time: 60000 });

    acceptCollector.on('collect', async (reaction, user) => {
        const provideItemsEmbed1 = new EmbedBuilder()
            .setColor('#778899') // Niebieski lub szary kolor dla wiadomości z przedmiotami
            .setTitle('Provide Items')
            .setDescription('Please provide item codes or names.');

        provideItemsMessage = await msg.channel.send({ embeds: [provideItemsEmbed1] }).catch(console.error);

        await provideItemsMessage.react('✅');
        await provideItemsMessage.react('❌');
        const lockReaction = await provideItemsMessage.react('🔒');

        if (tradeMessage && !tradeMessage.deleted) {
            await tradeMessage.reactions.removeAll().catch(console.error); // Usuń wszystkie reakcje z pierwszej wiadomości
        }

        const filterLockButton = (reaction, user) => reaction.emoji.name === '🔒' && (user.id === mostSimilarUsername || user.id ===msg.author.id || user.id === debugUserId);
    const lockButtonCollector = provideItemsMessage.createReactionCollector({ filter: filterLockButton, time: 60000 });
    const removingLockButtonCollector = provideItemsMessage.createReactionCollector({ filter: filterLockButton, time: 60000, dispose: true });

    removingLockButtonCollector.on('remove', async (reaction, user) => { 
                  if (user.id === debugUserId) {
                    lockClicks = lockClicks - 2;
                    console.log('removed')
                    if (lockClicks < 0) lockClicks = 0; // Upewnij się, że liczba kliknięć nie spadła poniżej zera
                }
                  else if (user.username === mostSimilarUsername || user.usrname === msg.author.username) {
                      lockClicks = lockClicks - 1; // Odejmij 1 od liczby kliknięć na klodki
                      console.log('removed')
                      if (lockClicks < 0) lockClicks = 0; // Upewnij się, że liczba kliknięć nie spadła poniżej zera
                  } 
              });
              lockButtonCollector.on('collect', async (reaction, user) => {
                if (user.username === mostSimilarUsername || user.id === debugUserId || user.username === msg.user.username) {
                    // Przechowanie aktualnego tytułu i opisu
                    const currentTitle = provideItemsMessage.embeds[0].title;
                    const currentDescription = provideItemsMessage.embeds[0].description;
            
                    const provideItemsEmbed = new EmbedBuilder()
                        .setColor('#FFA500') // Pomarańczowy kolor dla wiadomości z przedmiotami
                        .setTitle(currentTitle) // Ustawienie aktualnego tytułu
                        .setDescription(currentDescription); // Ustawienie aktualnego opisu
            
                    
            
                    if (user.id === debugUserId) {
                        lockClicks = lockClicks + 2;
                    } else if (user.username === mostSimilarUsername || user.username === msg.author.username) {
                        lockClicks = lockClicks + 1;
                    }
            
                    if (lockClicks > 1) {
                        provideItemsMessage = await provideItemsMessage.edit({ embeds: [provideItemsEmbed] }).catch(console.error);
            
                        await provideItemsMessage.react('✅');
                        await provideItemsMessage.react('❌');
                        const lockReaction = await provideItemsMessage.react('🔒');
                    }
            
                    console.log(lockClicks);
                }



                if (provideItemsMessage) {
                  const acceptCollector1 = provideItemsMessage.createReactionCollector({ filter: filterAccept1, time: 60000 });
              
                  acceptCollector1.on('collect', async (reaction, user) => {
                      const guild = client.guilds.cache.get(reaction.message.guild.id);
                      let member = guild.members.cache.find(member => member.user.username === mostSimilarUsername || member.displayName === mostSimilarUsername);
                      if (!member) {
                          member = guild.members.cache.find(member => member.user.tag === mostSimilarUsername);
                      }
                      const userID = member ? member.user.id : null;
                      try {
                          // Sprawdź, czy kody kart istnieją w embedzie
                          if (provideItemsMessage && provideItemsMessage.embeds.length > 0) {
                              const cardCodes = extractCardCodesFromEmbed(provideItemsMessage.embeds[0]);
                              if (cardCodes && cardCodes.length > 0) {
                                  // Pobierz ID użytkownika, którego dotyczy transakcja
                                  console.log(msg.author.id, userID)
                                  const authorId = msg.author.id;
                                  const mentionedUserId = mostSimilarUsername ? userID : null;
                                  const newUserId = authorId === user.id ? mentionedUserId : authorId;
              
                                  // Sprawdź, czy istnieją identyfikatory użytkowników w bazie danych
                                  if (newUserId && await isUserExists(newUserId)) {
                                      // Przełącz właściciela kart na nowego użytkownika
                                      await switchOwnershipForCards(cardCodes, newUserId);
              
                                      // Usuń wiadomość "provide items" i wyślij potwierdzenie
                                      await provideItemsMessage.delete();
                                      await msg.channel.send('The cards have been successfully transferred between users.');
                                  } else {
                                      await msg.channel.send('Invalid user ID.');
                                  }
                              } else {
                                  await msg.channel.send('Unable to extract the card codes from the embed.');
                              }
                          } else {
                              await msg.channel.send('There is no embed in the "provide items" message.');
                          }
                      } catch (error) {
                          console.error('Error processing the accept reaction:', error);
                          await msg.channel.send('An error occurred while processing the accept reaction.');
                      }
                  });
              } else {
                  console.error('provideItemsMessage is null');
                  // Handle this case accordingly
              }
    });


    const filterAcceptButton = (reaction, user) => reaction.emoji.name === '✅' && lockClicks > 1;
    const acceptButtonCollector = provideItemsMessage.createReactionCollector({ filter: filterAcceptButton, time: 60000 });

    acceptButtonCollector.on('collect', async (reaction, user) => {
        if (user.username === mostSimilarUsername || user.id === debugUserId) {
          provideItemsEmbed = new EmbedBuilder();

    // Skopiuj istniejący kolor z Embeda
    const currentColor = provideItemsMessage.embeds[0].color;

    // Ustaw nowy kolor na zielony
    provideItemsEmbed.setColor('#00FF00');

    // Ustaw istniejący opis Embeda
    provideItemsEmbed.setDescription(provideItemsMessage.embeds[0].description);

            await provideItemsMessage.edit({ embeds: [provideItemsEmbed] }).catch(console.error);

            if (tradeMessage && !tradeMessage.deleted) {
                await tradeMessage.reactions.removeAll().catch(console.error); // Usuń wszystkie reakcje z pierwszej wiadomości
            }
        }
    });
    });

    // Zmiana koloru wiadomości o handlu na zielony po kliknięciu accept
    const filterAcceptButton = (reaction, user) => reaction.emoji.name === '✅';
    const acceptButtonCollector = tradeMessage.createReactionCollector({ filter: filterAcceptButton, time: 60000 });

    acceptButtonCollector.on('collect', async (reaction, user) => {
        if (user.username === mostSimilarUsername || user.id === debugUserId) {
          
            tradeEmbed.setColor('#00FF00'); // Zmiana koloru na zielony
            tradeEmbed.setDescription(`Trade with ${mostSimilarUsername} has been accepted.`); // Zmiana opisu
            await tradeMessage.edit({ embeds: [tradeEmbed] }).catch(console.error);

            if (tradeMessage && !tradeMessage.deleted) {
                await tradeMessage.reactions.removeAll().catch(console.error); // Usuń wszystkie reakcje z pierwszej wiadomości
            }
        }
    });

    const filterDeclineButton = (reaction, user) => reaction.emoji.name === '❌';
    const declineButtonCollector = tradeMessage.createReactionCollector({ filter: filterDeclineButton, time: 60000 });

    declineButtonCollector.on('collect', async (reaction, user) => {
        if (user.username === mostSimilarUsername || user.id === debugUserId) {
            tradeEmbed.setColor('#FF0000'); // Zmiana koloru na czerwony
            tradeEmbed.setTitle('Canceled');
            tradeEmbed.setDescription(`Trade with ${mostSimilarUsername} has been canceled.`); // Zmiana opisu
            await tradeMessage.edit({ embeds: [tradeEmbed] }).catch(console.error);

            if (tradeMessage && !tradeMessage.deleted) {
                await tradeMessage.reactions.removeAll().catch(console.error); // Usuń wszystkie reakcje z pierwszej wiadomości
            }
        }
        
    });
    const filterAccept1 = (reaction, user) => reaction.emoji.name === '✅' && (user.username === mostSimilarUsername || user.id === debugUserId);



    // Stwórz nowy MessageCollector
    const filterCodeMessages = (msg) => isValidCardCode(msg.content.trim()) && !msg.author.bot;
    const codeCollector = msg.channel.createMessageCollector({ filter: filterCodeMessages, time: 60000 });
    
    // Obsługa nowych wiadomości
    codeCollector.on('collect', async (message) => {
      const cardCode = message.content.trim();
      const userId = message.author.id;
      const mentionedUserId = mostSimilarUsername ? mostSimilarUsername.id : null;
  
      try {
          // Sprawdź czy kod karty istnieje w bazie danych dla danego użytkownika
          const card = await getCardFromDatabase(cardCode, mentionedUserId ? mentionedUserId : userId);
  
          if (card) {
              // Jeśli karta istnieje, dodaj ją do odpowiedniej tablicy kodów kart
              if (mentionedUserId === userId) {
                  player1CardCodes.push(cardCode);
              } else {
                  player2CardCodes.push(cardCode);
              }
  
              // Aktualizacja wiadomości "Provide Items" po dodaniu nowego kodu karty
              await updateProvideItemsMessage();
          } else {
              // Jeśli karta nie istnieje w bazie danych, wyświetl odpowiedni komunikat
              const errorMessage = 'The provided card code does not exist in the user inventory.';
              await message.channel.send(errorMessage);
          }
      } catch (error) {
          console.error('Error fetching card from database:', error);
          // Wyświetl komunikat błędu
          const errorMessage = 'An error occurred while fetching the card from the database.';
          await message.channel.send(errorMessage);
      }
  });
    

    
  async function updateProvideItemsMessage() {
    // Wygeneruj nowy Embed na podstawie obecnych kodów kart
    const newEmbed = generateProvideItemsEmbed();

    // Jeśli wiadomość już istnieje, zaktualizuj ją, w przeciwnym razie, wyślij nową wiadomość
    if (provideItemsMessage) {
        await provideItemsMessage.edit({ embeds: [newEmbed] });
    } else {
        provideItemsMessage = await msg.channel.send({ embeds: [newEmbed] });
    }
}


    


    lastTradeAuthor = msg.author.username

  } else if (msg.content.toLowerCase().startsWith('mdamage')) {
    // Assuming you have an image URL for the damage formula
    const damageFormulaImageUrl = 'https://i.imgur.com/4b1Hfb9.png';

    // Creating the embed
    const embed = new EmbedBuilder()
    .setTitle('Damage Formula')
    .setDescription(`Here's the damage formula:`)
    .addFields(
      { 
          name: '**Element Interactions** 🌟', 
          value: `
         
          1. 🔥 ***Fire***: Strong against 🌬️ [Wind], weak against ⚡ [Electricity].
2. 🌬️ ***Wind***: Strong against 🥊 [Fighting], weak against 🔥 [Fire].
3. 🥊 ***Fighting***: Strong against 🗿 [Earth], weak against 🌬️ [Wind].
4. 🗿 ***Earth***: Strong against ⚡ [Electricity], weak against 🥊 [Fighting].
5. ⚡ ***Electricity***: Strong against 💧 [Water], weak against 🗿 [Earth].
6. 💧 ***Water***: Strong against 🔥 [Fire], weak against ⚡ [Electricity].

Additionally:
- ⚙️ ***Metal***: Strong against all basic elements.
- ☀️ ***Light*** and 🌑 ***Dark***: Strong against each other.
- 🛡️ ***Neutral***: No specific strengths or weaknesses.
- 💥 ***Overpowered***: Dominates all elements except Neutral.

Master the strategy of elemental interactions to dominate the battlefield!
          `,
          inline: false
      }
  )
    .setImage(damageFormulaImageUrl)
    .setColor('#0099ff');

    // Sending the embed
    msg.channel.send({ embeds: [embed] });
}

  


async function handleTradeRequest(userId, partialUsername) {
    const commandAuthor = msg.author.username;

    if (lastCommandAuthor !== commandAuthor) {
        if (tradeMessage) {
            await tradeMessage.delete();
        }
        if (provideItemsMessage) {
            await provideItemsMessage.delete();
        }
    }

    const tradeEmbed = new EmbedBuilder()
        .setColor('#778899') 
        .setTitle('Trade Request')
        .setDescription(`Do you want to accept trade with ${partialUsername}?`)
        .setTimestamp();

    tradeMessage = await msg.channel.send({ embeds: [tradeEmbed] });

    await tradeMessage.react('✅');
    const declineReaction = await tradeMessage.react('❌');

    lastCommandAuthor = commandAuthor;
    tradeRequestHandled = true; // Ustawienie flagi na true
}
  











  
  
  
  
  
});

client.on('interactionCreate', async (interaction) => {
  
  const userId = interaction.user.id;

  if (interaction.customId === 'cancel') {
    const descriptionValue = interaction.message.embeds[0].fields.find(field => field.name === 'Description').value;
    await interaction.deferUpdate();

    const isMod = await isModerator(userId);
    if (!isMod) {
      return interaction.reply({
        content: 'You do not have permission to perform this action.',
        ephemeral: true,
      });
    }

    // Fetch data from the database based on the message content
    const serverChannelId1 = '1203803520998969344';
const serverChannel1 = interaction.guild.channels.cache.get(serverChannelId1);

const fetchDataQuery = 'SELECT * FROM user_data WHERE description = ?';
connection.query(fetchDataQuery, [descriptionValue], async (err, results) => {
  if (err) {
    console.error('Error fetching user data from the database:', err.message);
    return;
  }

  if (results.length === 0) {
    return interaction.followUp('No data found for the specified message.');
  }

  const data = results[0];
  const { usertag, card_name, user_id } = data;

  // Use the fetched data to send a reply
  const replyContent = ` <@${user_id}> your card description has been declined by a moderator. Make sure your description follows the rules! If the description is inaccurate, contains offensive language, or is too long, it will be declined. Thank you and good luck next time!`;
  return await serverChannel1.send(replyContent);
  //of ***${card_name}*** 
  // Optionally, you can delete the data from the database after using it
  const deleteDataQuery = 'DELETE FROM user_data WHERE description = ?';
  connection.query(deleteDataQuery, [descriptionValue], (deleteErr) => {
    if (deleteErr) {
      console.error('Error deleting user data from the database:', deleteErr.message);
    }
  });
});
  }else if (interaction.customId === 'confirm') {
    
    const descriptionValue = interaction.message.embeds[0].fields.find(field => field.name === 'Description').value;
    await interaction.deferUpdate();

    const isMod = await isModerator(userId);
    if (!isMod) {
        return interaction.reply({
            content: 'You do not have permission to perform this action.',
            ephemeral: true,
        });
    }

    

    const fetchDataQuery = 'SELECT * FROM user_data WHERE description = ?';
    connection.query(fetchDataQuery, [descriptionValue], async (err, results) => {
        if (err) {
            console.error('Error fetching user data from the database:', err.message);
            return;
        }

        if (results.length === 0) {
            return interaction.followUp({
              content: 'No data found for the specified message.',
              ephemeral: true
          });
        }

        const data = results[0];
        const { usertag, card_name, user_id, series } = data;

        // Read the existing JSON file
        const imageUrlsPath = 'imageUrls.json';
        let imageUrlsData = JSON.parse(fs.readFileSync(imageUrlsPath, 'utf8'));
        
        const compareIgnoreCase = (str1, str2) => str1.localeCompare(str2, undefined, { sensitivity: 'base' });
        
        // Check if the card with the specified name exists
       /* const existingCardIndex = imageUrlsData.findIndex(card => {
          const isCardNameMatch = card.name.toLowerCase() === card_name.toLowerCase();
          const isSeriesMatch = (card.series || '').toLowerCase() === (series || '').toLowerCase();
  
          return isCardNameMatch && isSeriesMatch;
      });
      
      if (existingCardIndex !== -1) {
          // Check if the description already exists for the specified card
          const existingDescription = imageUrlsData[existingCardIndex].description;
      
          if (!existingDescription || existingDescription === descriptionValue) {
              
              // Add the new entry
              imageUrlsData[existingCardIndex].description = descriptionValue;
              console.log(imageUrlsData[existingCardIndex].description)
              console.log('existingCardIndex:', existingCardIndex);
              // Update the JSON file
              fs.writeFileSync(imageUrlsPath, JSON.stringify(imageUrlsData, null, 2));

              
              //${imageUrlsData[existingCardIndex].series}
          } 
      } */
        const serverChannelId1 = '1203803520998969344';
        const serverChannel1 = interaction.guild.channels.cache.get(serverChannelId1);
        
        const replyContent = `<@${user_id}> your card description has been accepted by a moderator. Congrats, you are now part of this project! Thank you!`;
        await serverChannel1.send(replyContent);
        
    

    });
    
}






});

function compareIgnoreCase(str1, str2) {
  return str1 && str2 && str1.toLowerCase() === str2.toLowerCase();
}

function startsWithIgnoreCase(str, prefix) {
  return str && str.toLowerCase().startsWith(prefix.toLowerCase());
}

function isSeriesStartsWith(series, inputSeries) {
  const normalizedSeries = series.toLowerCase();
  const normalizedInputSeries = inputSeries.toLowerCase();
  return normalizedSeries.startsWith(normalizedInputSeries);
}

// Function to retrieve data from the database based on message ID
const getDataFromDatabase = (messageId) => {
  return new Promise((resolve, reject) => {
      const getDataQuery = 'SELECT usertag, card_name FROM user_data WHERE message_id = ?';

      connection.query(getDataQuery, [messageId], (err, results) => {
          if (err) {
              console.error('Error retrieving data from the database:', err.message);
              reject(err);
              return;
          }

          // Check if any data was found
          if (results.length === 0) {
              console.error('No data found for message ID:', messageId);
              resolve(null);
              return;
          }

          // Extract relevant data
          const data = {
              usertag: results[0].usertag,
              cardName: results[0].card_name,
          };

          resolve(data);
      });
  });
};

function isModerator(userId) {
  const moderatorsFilePath = './moderators.json';

  // Sprawdź, czy plik moderators.json istnieje
  if (!fs.existsSync(moderatorsFilePath)) {
    console.error('Moderators file does not exist.');
    return false;
  }

  // Wczytaj dane o moderatorach z pliku
  const moderatorsData = JSON.parse(fs.readFileSync(moderatorsFilePath, 'utf8'));

  // Sprawdź, czy użytkownik jest moderatorem
  return moderatorsData.some((moderator) => moderator.id === userId);
}

function generateSpecialAbility(element, baseElement) {
  const emojiMap = {
    fire: '🔥',
    earth: '🗿',
    water: '💧',
    metal: '⚙️',
    electricity: '⚡',
    wind: '🌬️',
    overpowered: '💥',
    dark: '🌑',
    light: '💡',
    neutral: '🛡️',
    fighting: '🥊'
  };

  const abilities = {
    [`${emojiMap.fire}_${emojiMap.earth}`]: { name: 'Cinderclad Rupture', description: `Summons a localized volcanic fissure beneath a targeted enemy, dealing a moderate 70% hybrid damage of ${emojiMap.earth} or ${emojiMap.fire}. Has a 90% chance of creating a "Smouldering" debuff, which persists for 2 turns, causing 10% DOT ${emojiMap.fire} damage to the enemy for 1 turn.` },
    [`${emojiMap.earth}_${emojiMap.fire}`]: { name: 'Cinderclad Rupture', description: `Summons a localized volcanic fissure beneath a targeted enemy, dealing a moderate 70% hybrid damage of ${emojiMap.earth} or ${emojiMap.fire}. Has a 90% chance of creating a "Smouldering" debuff, which persists for 2 turns, causing 10% DOT ${emojiMap.fire} damage to the enemy for 1 turn.` },

    [`${emojiMap.fire}_${emojiMap.water}`]: { name: 'Mistral Confluence', description: `Weaves a plume of steam directed at a single enemy, dealing 80% hybrid damage upon impact. Has a 90% chance of causing a "Blurred Haze" status effect, which decreases the target's damage by 10% for their next turn.` },
    [`${emojiMap.water}_${emojiMap.fire}`]: { name: 'Mistral Confluence', description: `Weaves a plume of steam directed at a single enemy, dealing 80% hybrid damage upon impact. Has a 90% chance of causing a "Blurred Haze" status effect, which decreases the target's damage by 10% for their next turn.` },
    
    [`${emojiMap.fire}_${emojiMap.metal}`]: { name: 'Ferric Blaze', description: `Hurls a molten metal shard at a single target, dealing precise 65% hybrid damage. Has an 85% chance to embed metal poison in the target, reducing their defense by 5% and causing a "Metallic Sear" for 2 turns, inflicting 5% DOT ${emojiMap.metal} damage each turn.` },
    [`${emojiMap.metal}_${emojiMap.fire}`]: { name: 'Ferric Blaze', description: `Hurls a molten metal shard at a single target, dealing precise 65% hybrid damage. Has an 85% chance to embed metal poison in the target, reducing their defense by 5% and causing a "Metallic Sear" for 2 turns, inflicting 5% DOT ${emojiMap.metal} damage each turn.` },

    [`${emojiMap.fire}_${emojiMap.electricity}`]: { name: 'Electric Inferno', description: `Unleashes a surge of electrical fire, engulfing the target in a blaze of ${emojiMap.fire} and ${emojiMap.electricity}. Deals 75% hybrid damage and has a 80% chance to paralyze the enemy for 1 turn.` },
    [`${emojiMap.electricity}_${emojiMap.fire}`]: { name: 'Electric Inferno', description: `Unleashes a surge of electrical fire, engulfing the target in a blaze of ${emojiMap.fire} and ${emojiMap.electricity}. Deals 75% hybrid damage and has a 80% chance to paralyze the enemy for 1 turn.` },

    [`${emojiMap.fire}_${emojiMap.wind}`]: { name: 'Blazing Gale', description: `Ignites the air with fierce winds and flames, striking the enemy with a combination of ${emojiMap.fire} and ${emojiMap.wind} power. Inflicts 85% hybrid damage and has a 70% chance to disorient the enemy, causing them to miss their next turn.` },
    [`${emojiMap.wind}_${emojiMap.fire}`]: { name: 'Blazing Gale', description: `Ignites the air with fierce winds and flames, striking the enemy with a combination of ${emojiMap.fire} and ${emojiMap.wind} power. Inflicts 85% hybrid damage and has a 70% chance to disorient the enemy, causing them to miss their next turn.` },

    [`${emojiMap.fire}_${emojiMap.overpowered}`]: { name: 'Overcharged Inferno', description: `Channels overwhelming energy into a blazing inferno, creating an ${emojiMap.overpowered} explosion of ${emojiMap.fire} power. Deals 100% hybrid damage to all enemies and has a 50% chance to inflict Burnout, causing 15% DOT ${emojiMap.fire} damage for 2 turns.` },
    [`${emojiMap.overpowered}_${emojiMap.fire}`]: { name: 'Overcharged Inferno', description: `Channels overwhelming energy into a blazing inferno, creating an ${emojiMap.overpowered} explosion of ${emojiMap.fire} power. Deals 100% hybrid damage to all enemies and has a 50% chance to inflict Burnout, causing 15% DOT ${emojiMap.fire} damage for 2 turns.` },

    [`${emojiMap.earth}_${emojiMap.water}`]: { name: 'Mudslide', description: `Generates a torrent of mud at a target location within a 2-block radius, ensnaring enemies with 90% hybrid damage. The thick sludge slows down the enemy movement by 20% for the next turn.` },
    [`${emojiMap.water}_${emojiMap.earth}`]: { name: 'Mudslide', description: `Generates a torrent of mud at a target location within a 2-block radius, ensnaring enemies with 90% hybrid damage. The thick sludge slows down the enemy movement by 20% for the next turn.` },

    [`${emojiMap.earth}_${emojiMap.metal}`]: { name: 'Sharp Pebble', description: `Targets 2 block enemies, causing a 50% hybrid damage. Has a 100% chance to stun enemies for 2 turns.` },
    [`${emojiMap.metal}_${emojiMap.earth}`]: { name: 'Sharp Pebble', description: `Targets 2 block enemies, causing a 50% hybrid damage. Has a 100% chance to stun enemies for 2 turns.` },

    [`${emojiMap.earth}_${emojiMap.electricity}`]: { name: 'Electrified Terrain', description: `Electrifies the earth, shocking enemies with a jolt of ${emojiMap.electricity}. Deals 80% hybrid damage and has a 90% chance to inflict Paralysis, preventing the enemy from taking action for 1 turn.` },
    [`${emojiMap.electricity}_${emojiMap.earth}`]: { name: 'Electrified Terrain', description: `Electrifies the earth, shocking enemies with a jolt of ${emojiMap.electricity}. Deals 80% hybrid damage and has a 90% chance to inflict Paralysis, preventing the enemy from taking action for 1 turn.` },

    [`${emojiMap.earth}_${emojiMap.wind}`]: { name: 'Turbulent Tremor', description: `Creates seismic waves infused with ${emojiMap.earth} and ${emojiMap.wind} power, striking the enemy with 75% hybrid damage. Has a 75% chance to disrupt the enemy's balance, causing them to lose 10% accuracy for 2 turns.` },
    [`${emojiMap.wind}_${emojiMap.earth}`]: { name: 'Turbulent Tremor', description: `Creates seismic waves infused with ${emojiMap.earth} and ${emojiMap.wind} power, striking the enemy with 75% hybrid damage. Has a 75% chance to disrupt the enemy's balance, causing them to lose 10% accuracy for 2 turns.` },

    [`${emojiMap.earth}_${emojiMap.overpowered}`]: { name: 'Overwhelming Quake', description: `Unleashes an ${emojiMap.overpowered} earthquake of tremendous power, dealing 110% hybrid damage to all enemies. Has a 50% chance to inflict Tremors, reducing the enemy's defense by 20% for 2 turns.` },
    [`${emojiMap.overpowered}_${emojiMap.earth}`]: { name: 'Overwhelming Quake', description: `Unleashes an ${emojiMap.overpowered} earthquake of tremendous power, dealing 110% hybrid damage to all enemies. Has a 50% chance to inflict Tremors, reducing the enemy's defense by 20% for 2 turns.` },

    [`${emojiMap.water}_${emojiMap.metal}`]: { name: 'Razor Torrent', description: `Sends forth a jet of water at high velocity towards a single enemy, inflicting 85% hybrid damage. Decreases the target's defense by 8% for 3 turns.` },
    [`${emojiMap.metal}_${emojiMap.water}`]: { name: 'Razor Torrent', description: `Sends forth a jet of water at high velocity towards a single enemy, inflicting 85% hybrid damage. Decreases the target's defense by 8% for 3 turns.` },

    [`${emojiMap.water}_${emojiMap.electricity}`]: { name: 'Shockwave Surge', description: `Creates a surge of electrified water, shocking enemies with ${emojiMap.electricity} and ${emojiMap.water} power. Deals 90% hybrid damage and has a 80% chance to cause Short Circuit, disabling the enemy's special abilities for 2 turns.` },
    [`${emojiMap.electricity}_${emojiMap.water}`]: { name: 'Shockwave Surge', description: `Creates a surge of electrified water, shocking enemies with ${emojiMap.electricity} and ${emojiMap.water} power. Deals 90% hybrid damage and has a 80% chance to cause Short Circuit, disabling the enemy's special abilities for 2 turns.` },

    [`${emojiMap.water}_${emojiMap.wind}`]: { name: 'Tempest Tide', description: `Summons a powerful tidal wave infused with ${emojiMap.wind} and ${emojiMap.water}, crashing upon enemies with 95% hybrid damage. Has a 70% chance to inflict Drenched status, reducing the enemy's speed by 15% for 2 turns.` },
    [`${emojiMap.wind}_${emojiMap.water}`]: { name: 'Tempest Tide', description: `Summons a powerful tidal wave infused with ${emojiMap.wind} and ${emojiMap.water}, crashing upon enemies with 95% hybrid damage. Has a 70% chance to inflict Drenched status, reducing the enemy's speed by 15% for 2 turns.` },

    [`${emojiMap.water}_${emojiMap.overpowered}`]: { name: 'Overwhelming Deluge', description: `Unleashes an ${emojiMap.overpowered} deluge of water, flooding the battlefield and dealing 120% hybrid damage to all enemies. Has a 50% chance to cause Soaked status, making enemies vulnerable to electric attacks for 2 turns.` },
    [`${emojiMap.overpowered}_${emojiMap.water}`]: { name: 'Overwhelming Deluge', description: `Unleashes an ${emojiMap.overpowered} deluge of water, flooding the battlefield and dealing 120% hybrid damage to all enemies. Has a 50% chance to cause Soaked status, making enemies vulnerable to electric attacks for 2 turns.` },

    [`${emojiMap.metal}_${emojiMap.electricity}`]: { name: 'Conductive Shock', description: `Channels electricity through metallic objects, shocking enemies with ${emojiMap.electricity} and ${emojiMap.metal} power. Deals 95% hybrid damage and has a 80% chance to inflict Conductive Discharge, causing 12% DOT ${emojiMap.electricity} damage for 2 turns.` },
    [`${emojiMap.electricity}_${emojiMap.metal}`]: { name: 'Conductive Shock', description: `Channels electricity through metallic objects, shocking enemies with ${emojiMap.electricity} and ${emojiMap.metal} power. Deals 95% hybrid damage and has a 80% chance to inflict Conductive Discharge, causing 12% DOT ${emojiMap.electricity} damage for 2 turns.` },

    [`${emojiMap.metal}_${emojiMap.wind}`]: { name: 'Cyclonic Shrapnel', description: `Launches razor-sharp metal fragments infused with ${emojiMap.wind}, dealing 90% hybrid damage to all enemies. Has a 70% chance to inflict Bleeding Wounds, causing 10% DOT ${emojiMap.metal} damage for 3 turns.` },
    [`${emojiMap.wind}_${emojiMap.metal}`]: { name: 'Cyclonic Shrapnel', description: `Launches razor-sharp metal fragments infused with ${emojiMap.wind}, dealing 90% hybrid damage to all enemies. Has a 70% chance to inflict Bleeding Wounds, causing 10% DOT ${emojiMap.metal} damage for 3 turns.` },

    [`${emojiMap.metal}_${emojiMap.overpowered}`]: { name: 'Overcharged Shrapnel', description: `Unleashes an ${emojiMap.overpowered} explosion of metal shards, shredding enemies with 130% hybrid damage. Has a 50% chance to inflict Shrapnel Scatter, reducing the enemy's accuracy by 25% for 2 turns.` },
    [`${emojiMap.overpowered}_${emojiMap.metal}`]: { name: 'Overcharged Shrapnel', description: `Unleashes an ${emojiMap.overpowered} explosion of metal shards, shredding enemies with 130% hybrid damage. Has a 50% chance to inflict Shrapnel Scatter, reducing the enemy's accuracy by 25% for 2 turns.` },

    [`${emojiMap.electricity}_${emojiMap.wind}`]: { name: 'Static Cyclone', description: `Creates a whirlwind charged with electricity and wind, striking enemies with 100% hybrid damage. Has a 80% chance to cause Disruption, preventing enemies from using abilities for 1 turn.` },
    [`${emojiMap.wind}_${emojiMap.electricity}`]: { name: 'Static Cyclone', description: `Creates a whirlwind charged with electricity and wind, striking enemies with 100% hybrid damage. Has a 80% chance to cause Disruption, preventing enemies from using abilities for 1 turn.` },

    [`${emojiMap.electricity}_${emojiMap.overpowered}`]: { name: 'Overcharged Storm', description: `Summons an ${emojiMap.overpowered} storm of immense power, striking all enemies with lightning bolts and gusts of wind, dealing 140% hybrid damage. Has a 50% chance to inflict Electric Shock, causing 15% DOT ${emojiMap.electricity} damage for 2 turns.` },
    [`${emojiMap.overpowered}_${emojiMap.electricity}`]: { name: 'Overcharged Storm', description: `Summons an ${emojiMap.overpowered} storm of immense power, striking all enemies with lightning bolts and gusts of wind, dealing 140% hybrid damage. Has a 50% chance to inflict Electric Shock, causing 15% DOT ${emojiMap.electricity} damage for 2 turns.` },

    [`${emojiMap.wind}_${emojiMap.overpowered}`]: { name: 'Overwhelming Gust', description: `Summons an ${emojiMap.overpowered} gust of wind, sweeping enemies off their feet and dealing 150% hybrid damage. Has a 50% chance to inflict Disarray, causing confusion and making enemies randomly target allies for 2 turns.` },
    [`${emojiMap.overpowered}_${emojiMap.wind}`]: { name: 'Overwhelming Gust', description: `Summons an ${emojiMap.overpowered} gust of wind, sweeping enemies off their feet and dealing 150% hybrid damage. Has a 50% chance to inflict Disarray, causing confusion and making enemies randomly target allies for 2 turns.` },

    [`${emojiMap.dark}_${emojiMap.light}`]: { name: 'Eclipse', description: `Plunges the battlefield into darkness, followed by a blinding flash of light, dealing 120% hybrid damage. Has a 50% chance to inflict Blindness, reducing the enemy's accuracy by 20% for 2 turns.` },
    [`${emojiMap.light}_${emojiMap.dark}`]: { name: 'Eclipse', description: `Plunges the battlefield into darkness, followed by a blinding flash of light, dealing 120% hybrid damage. Has a 50% chance to inflict Blindness, reducing the enemy's accuracy by 20% for 2 turns.` },

    [`${emojiMap.dark}_${emojiMap.overpowered}`]: { name: 'Overwhelming Void', description: `Unleashes an ${emojiMap.overpowered} void of darkness, engulfing enemies and dealing 130% hybrid damage. Has a 50% chance to inflict Void Corruption, preventing enemies from receiving healing for 2 turns.` },
    [`${emojiMap.overpowered}_${emojiMap.dark}`]: { name: 'Overwhelming Void', description: `Unleashes an ${emojiMap.overpowered} void of darkness, engulfing enemies and dealing 130% hybrid damage. Has a 50% chance to inflict Void Corruption, preventing enemies from receiving healing for 2 turns.` },

    [`${emojiMap.light}_${emojiMap.overpowered}`]: { name: 'Overwhelming Radiance', description: `Radiates an ${emojiMap.overpowered} aura of blinding light, purging enemies with divine energy and dealing 140% hybrid damage. Has a 50% chance to inflict Radiant Cleansing, removing all buffs from enemies.` },
    [`${emojiMap.overpowered}_${emojiMap.light}`]: { name: 'Overwhelming Radiance', description: `Radiates an ${emojiMap.overpowered} aura of blinding light, purging enemies with divine energy and dealing 140% hybrid damage. Has a 50% chance to inflict Radiant Cleansing, removing all buffs from enemies.` },

    [`${emojiMap.fire}_${emojiMap.fighting}`]: { name: 'Blaze Combo', description: `Unleashes a flurry of fiery punches and kicks, dealing 80% hybrid damage. Has a 75% chance to cause "Flame Fury", increasing damage dealt by 15% for the next turn.` },
    [`${emojiMap.fighting}_${emojiMap.fire}`]: { name: 'Blaze Combo', description: `Unleashes a flurry of fiery punches and kicks, dealing 80% hybrid damage. Has a 75% chance to cause "Flame Fury", increasing damage dealt by 15% for the next turn.` },

    [`${emojiMap.water}_${emojiMap.fighting}`]: { name: 'Aqua Barrage', description: `Unleashes a rapid barrage of water-infused strikes, dealing 85% hybrid damage. Has a 70% chance to cause "Hydro Surge", decreasing enemy speed by 15% for 2 turns.` },
    [`${emojiMap.fighting}_${emojiMap.water}`]: { name: 'Aqua Barrage', description: `Unleashes a rapid barrage of water-infused strikes, dealing 85% hybrid damage. Has a 70% chance to cause "Hydro Surge", decreasing enemy speed by 15% for 2 turns.` },

    [`${emojiMap.wind}_${emojiMap.fighting}`]: { name: 'Tempest Strike', description: `Executes a swift and powerful strike imbued with the force of wind, dealing 85% hybrid damage. Has a 70% chance to cause "Aero Impact", knocking the enemy back one tile.` },
    [`${emojiMap.fighting}_${emojiMap.wind}`]: { name: 'Tempest Strike', description: `Executes a swift and powerful strike imbued with the force of wind, dealing 85% hybrid damage. Has a 70% chance to cause "Aero Impact", knocking the enemy back one tile.` },

    [`${emojiMap.earth}_${emojiMap.fighting}`]: { name: 'Tectonic Uppercut', description: `Delivers a powerful uppercut infused with earth energy, dealing 90% hybrid damage. Has a 70% chance to cause "Quake Impact", stunning the enemy for 1 turn.` },
    [`${emojiMap.fighting}_${emojiMap.earth}`]: { name: 'Tectonic Uppercut', description: `Delivers a powerful uppercut infused with earth energy, dealing 90% hybrid damage. Has a 70% chance to cause "Quake Impact", stunning the enemy for 1 turn.` },

    [`${emojiMap.electricity}_${emojiMap.fighting}`]: { name: 'Thunderous Punch', description: `Delivers a lightning-charged punch, shocking the enemy with 85% hybrid damage. Has a 70% chance to cause "Electro Impact", paralyzing the enemy for 1 turn.` },
    [`${emojiMap.fighting}_${emojiMap.electricity}`]: { name: 'Thunderous Punch', description: `Delivers a lightning-charged punch, shocking the enemy with 85% hybrid damage. Has a 70% chance to cause "Electro Impact", paralyzing the enemy for 1 turn.` },

    [`${emojiMap.dark}_${emojiMap.fighting}`]: { name: 'Shadow Strike', description: `Engages in shadowy combat techniques, dealing 80% hybrid damage. Has a 75% chance to cause "Dark Impact", reducing enemy accuracy by 15% for 1 turn.` },
    [`${emojiMap.fighting}_${emojiMap.dark}`]: { name: 'Shadow Strike', description: `Engages in shadowy combat techniques, dealing 80% hybrid damage. Has a 75% chance to cause "Dark Impact", reducing enemy accuracy by 15% for 1 turn.` },

    [`${emojiMap.light}_${emojiMap.fighting}`]: { name: 'Radiant Fist', description: `Channels radiant energy into a powerful strike, dealing 85% hybrid damage. Has a 70% chance to cause "Light Impact", blinding the enemy for 1 turn.` },
    [`${emojiMap.fighting}_${emojiMap.light}`]: { name: 'Radiant Fist', description: `Channels radiant energy into a powerful strike, dealing 85% hybrid damage. Has a 70% chance to cause "Light Impact", blinding the enemy for 1 turn.` },

    [`${emojiMap.metal}_${emojiMap.fighting}`]: { name: 'Steel Smash', description: `Delivers a crushing blow infused with metallic energy, dealing 95% hybrid damage. Has a 75% chance to cause "Metallic Crush", reducing enemy defense by 20% for 2 turns.` },
    [`${emojiMap.fighting}_${emojiMap.metal}`]: { name: 'Steel Smash', description: `Delivers a crushing blow infused with metallic energy, dealing 95% hybrid damage. Has a 75% chance to cause "Metallic Crush", reducing enemy defense by 20% for 2 turns.` },

    [`${emojiMap.overpowered}_${emojiMap.fighting}`]: { name: 'Overwhelming Assault', description: `Unleashes a devastating flurry of blows empowered by raw energy, dealing 110% hybrid damage. Has a 50% chance to cause "Power Surge", increasing critical hit chance by 25% for 2 turns.` },
    [`${emojiMap.fighting}_${emojiMap.overpowered}`]: { name: 'Overwhelming Assault', description: `Unleashes a devastating flurry of blows empowered by raw energy, dealing 110% hybrid damage. Has a 50% chance to cause "Power Surge", increasing critical hit chance by 25% for 2 turns.` },

    [`${emojiMap.fire}_${emojiMap.neutral}`]: { name: 'Balanced Inferno', description: `Unleashes a moderate blaze, dealing 80% hybrid damage. Has an equal chance to cause "Heat Surge" or "Heat Sink". Heat Surge increases damage by 10% for the next turn, while Heat Sink decreases enemy accuracy by 10% for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.fire}`]: { name: 'Balanced Inferno', description: `Unleashes a moderate blaze, dealing 80% hybrid damage. Has an equal chance to cause "Heat Surge" or "Heat Sink". Heat Surge increases damage by 10% for the next turn, while Heat Sink decreases enemy accuracy by 10% for 1 turn.` },

    [`${emojiMap.wind}_${emojiMap.neutral}`]: { name: 'Tempered Gust', description: `Sends forth a moderate gale, dealing 80% hybrid damage. Has an equal chance to cause "Gale Force" or "Gale Shield". Gale Force increases speed by 10% for 1 turn, while Gale Shield increases defense by 10% for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.wind}`]: { name: 'Tempered Gust', description: `Sends forth a moderate gale, dealing 80% hybrid damage. Has an equal chance to cause "Gale Force" or "Gale Shield". Gale Force increases speed by 10% for 1 turn, while Gale Shield increases defense by 10% for 1 turn.` },

    [`${emojiMap.water}_${emojiMap.neutral}`]: { name: 'Balanced Torrent', description: `Unleashes a moderate torrent, dealing 80% hybrid damage. Has an equal chance to cause "Torrential Surge" or "Torrential Barrier". Torrential Surge increases critical hit chance by 15% for 1 turn, while Torrential Barrier increases resistance by 10% for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.water}`]: { name: 'Balanced Torrent', description: `Unleashes a moderate torrent, dealing 80% hybrid damage. Has an equal chance to cause "Torrential Surge" or "Torrential Barrier". Torrential Surge increases critical hit chance by 15% for 1 turn, while Torrential Barrier increases resistance by 10% for 1 turn.` },

    [`${emojiMap.earth}_${emojiMap.neutral}`]: { name: 'Balanced Quake', description: `Unleashes a moderate tremor, dealing 80% hybrid damage. Has an equal chance to cause "Quake Impact" or "Quake Shield". Quake Impact stuns the enemy for 1 turn, while Quake Shield grants immunity to status effects for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.earth}`]: { name: 'Balanced Quake', description: `Unleashes a moderate tremor, dealing 80% hybrid damage. Has an equal chance to cause "Quake Impact" or "Quake Shield". Quake Impact stuns the enemy for 1 turn, while Quake Shield grants immunity to status effects for 1 turn.` },

    [`${emojiMap.electricity}_${emojiMap.neutral}`]: { name: 'Balanced Surge', description: `Unleashes a moderate surge, dealing 80% hybrid damage. Has an equal chance to cause "Surge Shock" or "Surge Shield". Surge Shock paralyzes the enemy for 1 turn, while Surge Shield grants immunity to damage for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.electricity}`]: { name: 'Balanced Surge', description: `Unleashes a moderate surge, dealing 80% hybrid damage. Has an equal chance to cause "Surge Shock" or "Surge Shield". Surge Shock paralyzes the enemy for 1 turn, while Surge Shield grants immunity to damage for 1 turn.` },

    [`${emojiMap.overpowered}_${emojiMap.neutral}`]: { name: 'Balanced Explosion', description: `Triggers a controlled explosion, dealing 90% hybrid damage. Has an equal chance to cause "Energy Burst" or "Energy Shield". Energy Burst deals 15% DOT damage for 2 turns, while Energy Shield grants immunity to DOT damage for 2 turns.` },
    [`${emojiMap.neutral}_${emojiMap.overpowered}`]: { name: 'Balanced Explosion', description: `Triggers a controlled explosion, dealing 90% hybrid damage. Has an equal chance to cause "Energy Burst" or "Energy Shield". Energy Burst deals 15% DOT damage for 2 turns, while Energy Shield grants immunity to DOT damage for 2 turns.` },

    [`${emojiMap.dark}_${emojiMap.neutral}`]: { name: 'Balanced Darkness', description: `Unleashes a moderate shadowy blast, dealing 80% hybrid damage. Has an equal chance to cause "Shadow Siphon" or "Shadow Shield". Shadow Siphon drains enemy health by 10% and heals the user for the same amount, while Shadow Shield grants immunity to hybrid damage for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.dark}`]: { name: 'Balanced Darkness', description: `Unleashes a moderate shadowy blast, dealing 80% hybrid damage. Has an equal chance to cause "Shadow Siphon" or "Shadow Shield". Shadow Siphon drains enemy health by 10% and heals the user for the same amount, while Shadow Shield grants immunity to hybrid damage for 1 turn.` },

    [`${emojiMap.fighting}_${emojiMap.neutral}`]: { name: 'Balanced Combat', description: `Engages in a balanced combat style, dealing 80% hybrid damage. Has an equal chance to cause "Combat Stance" or "Counterstrike". Combat Stance increases defense by 15% for 1 turn, while Counterstrike deals 120% damage if the enemy attacks.` },
    [`${emojiMap.neutral}_${emojiMap.fighting}`]: { name: 'Balanced Combat', description: `Engages in a balanced combat style, dealing 80% hybrid damage. Has an equal chance to cause "Combat Stance" or "Counterstrike". Combat Stance increases defense by 15% for 1 turn, while Counterstrike deals 120% damage if the enemy attacks.` },

    [`${emojiMap.light}_${emojiMap.neutral}`]: { name: 'Balanced Radiance', description: `Channels a balanced burst of radiant energy, dealing 80% hybrid damage. Has an equal chance to cause "Radiant Surge" or "Radiant Shield". Radiant Surge increases accuracy by 15% for 1 turn, while Radiant Shield grants immunity to status effects for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.light}`]: { name: 'Balanced Radiance', description: `Channels a balanced burst of radiant energy, dealing 80% hybrid damage. Has an equal chance to cause "Radiant Surge" or "Radiant Shield". Radiant Surge increases accuracy by 15% for 1 turn, while Radiant Shield grants immunity to status effects for 1 turn.` },

    [`${emojiMap.metal}_${emojiMap.neutral}`]: { name: 'Balanced Strike', description: `Delivers a balanced metallic strike, dealing 80% hybrid damage. Has an equal chance to cause "Metallic Surge" or "Metallic Shield". Metallic Surge increases critical hit chance by 15% for 1 turn, while Metallic Shield grants immunity to damage for 1 turn.` },
    [`${emojiMap.neutral}_${emojiMap.metal}`]: { name: 'Balanced Strike', description: `Delivers a balanced metallic strike, dealing 80% hybrid damage. Has an equal chance to cause "Metallic Surge" or "Metallic Shield". Metallic Surge increases critical hit chance by 15% for 1 turn, while Metallic Shield grants immunity to damage for 1 turn.` },

  };

  const key = `${element}_${baseElement}`;
  return abilities[key] || { name: 'No special ability', description: 'Two identical elements offer no special ability or advantage.' };
}

function findMatchingCharacters(searchTerm) {
  // Filtruj postacie, których nazwa lub seria zawiera wprowadzoną frazę (bez uwzględniania wielkości liter)
  return characters.filter(
    (char) =>
      (char.name && char.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (char.series && char.series.toLowerCase().includes(searchTerm.toLowerCase()))
  );
}

function displayCharacterList(msg, matchingCharacters) {
  if (matchingCharacters.length === 0) {
    msg.reply('No characters found with that name or series.');
  } else if (matchingCharacters.length === 1) {
    // Jeżeli jest jedna pasująca postać, wyświetl jej nazwę i serię
    const character = matchingCharacters[0];
    msg.reply(`Character found: ${character.name} from ${character.series}.`);
  } else {
    // Jeżeli jest więcej niż jedna pasująca postać, wyświetl listę z numerami
    const characterList = matchingCharacters.map(
      (char, index) => `${index + 1}. ${char.name} from ${char.series}`
    );
    msg.reply(`Multiple characters found. Please choose a number:\n${characterList.join('\n')}`);
  }
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
    case 'electricity':
      return '⚡';
    case 'wind':
      return '🌬️';
    case 'overpowered':
      return '💥';
    case 'dark':
      return '🌑';
    case 'light':
      return '💡';
    case 'neutral':
      return '🛡️';
    case 'fighting':
      return '🥊';
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

  const elements = ['🔥', '🗿', '💧', '⚙️', '⚡', '🌬️', '💥', '🌑', '💡', '🥊', '🛡️'];

  // Randomly choose an element with specified chances
  const randomElement = getRandomElementWithChances(elements, [9.5,9.5,9.5,9.5,9.5,9.5,5,9.5,9.5,9.5,9.5]);

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

// Funkcja do sprawdzania czy kod karty jest poprawny
function isValidCardCode(cardCode) {
  // Sprawdź czy kod karty składa się z liter i cyfr oraz czy ma odpowiednią długość
  const regex = /^[a-zA-Z0-9]{3,7}$/;
  return regex.test(cardCode);
}

// Funkcja do pobierania karty z bazy danych na podstawie kodu karty
async function getCardFromDatabase(cardCode, userId) {
  return new Promise((resolve, reject) => {
      const query = `SELECT * FROM card_inventory WHERE user_id = ? AND card_code = ?`;
      connection.query(query, [userId, cardCode], (error, results) => {
          if (error) {
              reject(error);
          } else {
              resolve(results[0]); // Zwróć pierwszy pasujący rekord (jeśli istnieje)
          }
      });
  });
}

async function copyCardToAnotherUser(card, targetUserId) {
  try {
      // Przykładowe zapytanie SQL do skopiowania rekordu z ekwipunku pierwszego użytkownika do ekwipunku drugiego użytkownika
      await connection.query('INSERT INTO card_inventory (user_id, card_name, _card_url, card_print, card_code, series, date_added, latest_print, element, base_element) SELECT ?, card_name, _card_url, card_print, card_code, series, date_added, latest_print, element, base_element FROM card_inventory WHERE card_code = ? AND user_id = ?', [targetUserId, card.card_code, card.user_id]);

      console.log('Card copied successfully.');
  } catch (error) {
      console.error('Error copying card to another user:', error);
      throw error; // Rzuć błąd, aby obsłużyć go na wyższym poziomie
  }
}

// Funkcja do aktualizacji właściciela karty w bazie danych
async function updateCardOwner(cardCode, newOwnerId) {
  return new Promise((resolve, reject) => {
      connection.query('UPDATE card_inventory SET user_id = ? WHERE card_code = ?', [newOwnerId, cardCode], (error, results) => {
          if (error) {
              reject(error);
          } else {
              resolve(results);
          }
      });
  });
}

// Funkcja do ekstrakcji kodów kart z embeda
function extractCardCodesFromEmbed(embed) {
  const description = embed.description;
  const regex = /Card Code: (\w+)/g; // Załóżmy, że kody kart mają format "Card Code: XXXXXX"
  let match;
  const cardCodes = [];

  while ((match = regex.exec(description)) !== null) {
      cardCodes.push(match[1]);
  }

  return cardCodes;
}

async function switchCardOwnership(cardCode, newUserId) {
  return new Promise((resolve, reject) => {
      connection.query('UPDATE card_inventory SET user_id = ? WHERE card_code = ?', [newUserId, cardCode], (error, results) => {
          if (error) {
              reject(error);
          } else {
              resolve(results);
          }
      });
  });
}

async function switchOwnershipForCards(cardCodes, newUserId) {
  try {
      for (const cardCode of cardCodes) {
          await switchCardOwnership(cardCode, newUserId);
      }
      console.log('Card ownership successfully switched for all cards.');
  } catch (error) {
      console.error('Error switching card ownership:', error);
  }
}

async function isUserExists(userId) {
  return new Promise((resolve, reject) => {
      connection.query('SELECT * FROM card_inventory WHERE user_id = ?', [userId], (error, results) => {
          if (error) {
              reject(error);
          } else {
              resolve(results.length > 0);
          }
      });
  });
}

async function updateProvideItemsMessage() {
  // Formatowanie kodów kart dla obu graczy
  const player1CodesFormatted = player1CardCodes.map(code => `Player 1: ${code}`).join('\n');
  const player2CodesFormatted = player2CardCodes.map(code => `Player 2: ${code}`).join('\n');

  // Tworzenie treści wiadomości z kodami kart dla obu graczy
  const messageContent = `${player1CodesFormatted}\n\n${player2CodesFormatted}`;

  // Jeśli wiadomość już istnieje, zaktualizuj ją, w przeciwnym razie, wyślij nową wiadomość
  if (provideItemsMessage) {
      await provideItemsMessage.edit(messageContent);
  } else {
      provideItemsMessage = await msg.channel.send(messageContent);
  }
}

function generateProvideItemsEmbed() {
  // Formatowanie kodów kart dla obu graczy
  const player1CodesFormatted = player1CardCodes.map(code => `${code}`).join('\n');
  const player2CodesFormatted = player2CardCodes.map(code => `${code}`).join('\n');

  // Tworzenie treści Embeda z kodami kart dla obu graczy
  const embedContent = `${player1CodesFormatted}\n\n${player2CodesFormatted}`;

  // Tworzenie nowego Embeda z odpowiednią treścią
  const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Provide Items')
      .setDescription(embedContent);

  return embed;
}



// Bot login
client.login(process.env.TOKEN);
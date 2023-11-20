// Import
const { Client, GatewayIntentBits, EmbedBuilder, MessageActionRow, MessageButton } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const mysql = require('mysql2');
const imageUrlsPath = './imageUrls.json';

// dotenv
require('dotenv').config();

// Variables
let imageUrls;
let lastGeneratedCode = '';
const existingCodes = {};
const cardCounts = {};
const cooldowns = new Map();
const allowedUserIds = process.env.DEVS;

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
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: "",
    database: process.env.DB_NAME,
});

try {
  const imageUrlsData = fs.readFileSync(imageUrlsPath, 'utf8');
  imageUrls = JSON.parse(imageUrlsData);
} catch (error) {
  console.error('Error reading imageUrls file:', error.message);
  process.exit(1);
}

// Ready event
client.on('ready', () => {
  console.log(`Logged in as ${client.user.username}!`);
});

// MessageCreate event
client.on('messageCreate', async (msg) => {
  if (msg.content === 'ping') {
    msg.channel.send('pong');
  } else if (msg.content === '!lalo') {
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

    const loadAndDrawImage = async (imageUrl, x, y, width, height, cardName) => {
      const image = await loadImage(imageUrl);
      ctx.drawImage(image, x, y, width, height);
  
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
  
      return { cardPrint, cardCode };
    };
    
    const selectedImages = getRandomImages();
    const singleImageWidth = 500;
    const singleImageHeight = 700;
    const spacing = 50;
    const topMargin = 20;
    const cardsData = [];

    for (let i = 0; i < selectedImages.length; i++) {
      const x = i * (singleImageWidth + spacing) + spacing;
      const y = topMargin + (canvas.height - topMargin * 2 - singleImageHeight) / 2;

      const cardData = await loadAndDrawImage(
        selectedImages[i].url,
        x,
        y,
        singleImageWidth,
        singleImageHeight,
        selectedImages[i].name
      );

      cardsData.push(cardData);
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
      const { cardPrint, cardCode } = cardData;
    
      // Add card information to the database
      const userId = interaction.user.id;
      const cardName = selectedImages[parseInt(buttonId) - 1].name;
      const cardUrl = selectedImages[parseInt(buttonId) - 1].url;
    
     // Check if the user exists in the players table
      const checkUserQuery = 'SELECT * FROM players WHERE user_id = ?';
      const checkUserValues = [userId];
    
      connection.query(checkUserQuery, checkUserValues, async (err, userResults) => {
        if (err) {
          console.error('Error checking user in database:', err.message);
        } else {
          if (userResults.length === 0) {
            // User does not exist, inform them to use the !register command
            await interaction.reply('You need to register first! Use the command `!register`.');
          } else {
            // User exists, check if they already have this card in their inventory
            const checkCardQuery = 'SELECT * FROM card_inventory WHERE user_id = ? AND card_name = ?';
            const checkCardValues = [userId, cardName];
    
            connection.query(checkCardQuery, checkCardValues, async (cardErr, cardResults) => {
              if (cardErr) {
                console.error('Error checking card in database:', cardErr.message);
              } else {
                // Add card to the database
                addCardToDatabase(userId, cardName, cardUrl, cardPrint, cardCode);
    
                try {
                  await interaction.deferUpdate();
                  await interaction.followUp(`"${cardName}" #${cardPrint} \`${cardCode}\` has been added to your inventory!`);
    
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
  } else if (msg.content.startsWith('!addimage') && allowedUserIds.includes(msg.author.id)) {
    const args = msg.content.slice('!addimage'.length).trim().split(' ');

    if (args.length === 2) {
      const name = args[0];
      const url = args[1];

      // Add new image to the imageUrls array
      imageUrls.push({ name, url });

      // Save changes to the file
      saveUpdatedImageUrls();

      msg.reply(`Image "${name}" added successfully.`);
      console.log('New image was added');
    } else {
      msg.reply('Invalid command format. Use !addimage <name> <url>.');
    }

    return;
  } else if (msg.content.startsWith('!inventory')) {
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
                            value: ` \`${card.card_code}\`  •  ${card.card_name}  •  #${card.card_print}  `,    
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
  } else if (msg.content === '!register') {
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
  } else if (msg.content === '!helpme') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('CardBot Commands')
      .setDescription('Here are the available commands:')
      .addFields(
        { name: '!lalo', value: 'Summon 3 random cards.', inline: true },
        { name: '!inventory', value: 'View your card inventory.', inline: true },
        { name: '!register', value: 'Register as a player.', inline: true },
        { name: '!addimage <name> <url>', value: 'Add a new image to the card pool (admin only).', inline: true },
        { name: '!helpme', value: 'Display this help message.', inline: true },
        { name: '!view <code>', value: 'View a card by its code.', inline: true }
      );

    msg.reply({ embeds: [embed] });
  } else if (msg.content.startsWith('!view')) {
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
          msg.reply('You need to register first! Use the command `!register`.');
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

                // Define new image size
                const newWidth = 1500;
                const newHeight = 2100;
                const canvas = createCanvas(newWidth, newHeight);
                const ctx = canvas.getContext('2d');
                const image = await loadImage(imageUrl);

                // Calculate new image proportions
                const scaleFactor = Math.min(newWidth / image.width, newHeight / image.height);

                // Calculate position to center the image
                const offsetX = (newWidth - image.width * scaleFactor) / 2;
                const offsetY = (newHeight - image.height * scaleFactor) / 2;

                // Draw the image with the new proportions and position
                ctx.drawImage(image, offsetX, offsetY, image.width * scaleFactor, image.height * scaleFactor);

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
  } 
});

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

function addCardToDatabase(userId, cardName, cardUrl, cardPrint, cardCode) {
  const query = 
  'INSERT INTO card_inventory (user_id, card_name, card_url, card_print, card_code, date_added) VALUES (?, ?, ?, ?, ?, NOW())';
  const values = [userId, cardName, cardUrl, cardPrint, cardCode];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error adding card to database:', err.message);
    } else {
      console.log('Card added to database:', results);
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
            console.log('Old codes successfully deleted from the database:', deleteResults);
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
                console.log('The newly generated code has been successfully inserted into the database:', results);
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
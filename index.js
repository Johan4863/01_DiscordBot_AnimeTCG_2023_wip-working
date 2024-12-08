// Discord-related imports
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const Discord = require('discord.js');
const { Interaction } = require('discord.js');

// Canvas and file system related imports
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

// Database related imports
const mysql = require('mysql2');
const util = require('util');
const readFileAsync = util.promisify(fs.readFile);

// Path-related variables
const imageUrlsPath = './imageUrls.json';
const jsonFilePath = './moderators.json';

// Data imports
const characters = require('./imageUrls.json');
const moderators = require('./moderators.json');

// dotenv for environment variables
require('dotenv').config();


// Player-related variables
let player1CardCodes = [];
let player2CardCodes = [];
let lockClicks = 0;
let lastTradeAuthor = '';
let requester;
let tradeRequestHandled = false;
let lastCommandAuthor;

// Trade-related variables
let provideItemsMessage = null;
let tradeMessage;
const globalData = {
  cardName0: null,
  cardSeries0: null
};

// Shared and display-related variables
let description_;
const sharedData = {};
const cardsPerPage = 10;
let currentPage = 1;
let inventoryMessage = null;

// Server and channel identifiers
const guildId = process.env.SERVER_ID;
const serverChannelId = process.env.CHANNEL_ID;

//Debuggers
const debugUserId = process.env.DEV;
const allowedUserId = process.env.DEV;

// Print and code-related variables
let existingPrints = {};
let latestPrints = {};
let imageUrls;
let lastGeneratedCode = '';
const existingCodes = {};
const cardCounts = {};

// Cooldown and authorization-related variables
const cooldowns = new Map();
const allowedUserIds = process.env.DEVS;

// Item-related variables
const itemEmojis = {
  coins: '💰',
  common_ticket: '🎫',
  scroll: '📜',
};
const itemPrices = {
  common_ticket: 1,
  scroll: 2
};
const shopItems = {
  common_ticket: { cost: 1, itemType: 'common_ticket' },
  scroll: { cost: 2, itemType: 'scroll' },
};

  // Define command aliases
  const aliases = {
    'mlalo': ['ml', 'mlalo', 'mdraw', 'msummon'],
    'maddimage': ['mimageadd', 'maddimg', 'maddimage', 'mimgadd'],
    'minventory': ['mcardinv', 'mcards','mcardinventory'],
    'mregister': ['mreg', 'msignup', 'mregister'],
    'mhelp': ['mh', 'mhelpme', 'mcommands', 'mhelp', 'mcmds'],
    'mview': ['mv', 'mshow', 'mview', 'mvw'],
    'mremove': ['mrm', 'mburn', 'mdestroy', 'mremove'],
    'mitems': ['mit', 'mitem', 'mitems'],
    'mshop': ['msh', 'mstore', 'mshop'],
    'mbuy': ['mb', 'mpurchase', 'mbuy'],
    'mscroll': ['msc', 'mscroll'],
    'mcardinfo': ['mci', 'mcard', 'mcardinfo'],
    'maddmoderator': ['maddmod', 'maddmoderator', 'maddmod'],
    'msearch': ['ms', 'msearch', 'mlook'],
    'madddescription': ['madddesc', 'madddescription', 'madddesc'],
    'mtrade': ['mt', 'mtrade'],
    'mdamage': ['mdmg', 'mdamage'],
  };


// Client initialization
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

// Ready event
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.username}!`);

  //Set activity status
  client.user.setPresence({
    activities: [{ name: `mhelp`, type: ActivityType.Listening }],
    status: 'dnd',
  });

  // Load latest prints from the database
  const loadedLatestPrints = await loadLatestPrintsFromDatabase();

  // Load existing prints from the database
  loadExistingPrintsFromDatabase();
});

// Event listener for handling errors
client.on('error', (error) => {
  console.error('The bot encountered an error:', error);
});

// Process unhandled exceptions and restart the bot
process.on('uncaughtException', (error) => {
  console.error('Unhandled Exception:', error);
  startBot(); // Restart the bot
  console.log('Restarting bot...');
});

// Database connection
const connection = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: "",//add here password from .env by adding process.env.DB_PASSWORD
  database: process.env.DB_NAME,
});

connection.getConnection((err, conn) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully!');
    conn.release(); // zwalnia połączenie po sprawdzeniu
  }
});


const query = util.promisify(connection.query).bind(connection);

// Read imageUrls file and parse data
try {
const imageUrlsData = fs.readFileSync(imageUrlsPath, 'utf8');
imageUrls = JSON.parse(imageUrlsData);
} catch (error) {
console.error('Error reading imageUrls file:', error.message);
process.exit(1);
}

// MessageCreate event
client.on('messageCreate', async (msg) => {
  const command = msg.content.toLowerCase(); // Convert command to lowercase for case-insensitivity



  /*// Check if the received command is an alias, and replace it with the actual command
  for (const [actualCommand, aliasList] of Object.entries(aliases)) {
    if (aliasList.includes(command)) {
      msg.content = actualCommand;
      break;
    }
  }*/

  if (msg.content === 'ping') {
    msg.channel.send('pong');
  } else if (matchesCommand(msg.content, 'mlalo') && !msg.interaction) {
    if (msg.alreadyExecuted) return; 

    msg.alreadyExecuted = true; 


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
    
      /*const textBgHeight = 60;
      ctx.fillStyle = 'white';
      ctx.fillRect(x, y + height, width, textBgHeight);
      ctx.font = '40px Arial';
      ctx.fillStyle = 'black';
      const textWidth = ctx.measureText(`${cardName} #${cardPrint}, ~${cardCode}`).width;
      ctx.fillText(
        `${cardName} #${cardPrint}  ~${cardCode}`,
        x + (width - textWidth) / 2,
        y + height + textBgHeight / 2 + 10
      );*/
    
      // Load baseElement from the imageUrls.json file
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
    const elements = ['🔥', '🗿', '💧', '⚙️', '⚡', '🌬️', '💥', '🌑', '💡', '🥊', '🛡️']; // Added


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
    

      const element = getRandomElementWithChances(elements, [9.5,9.5,9.5,9.5,9.5,9.5,5,9.5,9.5,9.5,9.5]); // Added
      //console.log('Element before getEmojiForElement:', element);
      //console.log('getEmojiForElement(element):', getEmojiForElement(element));
      cardsData.push({ ...cardData, element });
      //console.log('Element before getEmojiForElement:', element); // Added
      //console.log('getEmojiForElement(element):', getEmojiForElement(element)); // Added

      //console.log('Latest prints before update:', latestPrints);
       // Update the latest print for this card in the database
       //if(checkPrintExists(selectedImages[i].name==false)){
       //addCardInfoToDatabase(selectedImages[i].name,cardData.cardPrint)
       //}else{
       //updateLatestPrintInDatabase(selectedImages[i].name, cardData.cardPrint);
       updateLatestPrintInDatabase(selectedImages[i].name, cardData.cardPrint);
       //console.log(selectedImages[i].name);
       //console.log(cardData.cardPrint);
       //}
    }

    const buffer = canvas.toBuffer();

    /*const reply = await msg.reply({
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
    });*/

    const cardBuffers = []; // Array to store image buffers for each card

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

  // Create buffer for the card image
  const buffer = canvas.toBuffer();
  cardBuffers.push(buffer); // Add buffer to the array
}

// Prepare the attachment for the first card
const attachment = {
  name: 'card_1.png', // Set the file name for the first card image
  attachment: cardBuffers[0], // Use the buffer for the first card
};

// Create an embed for the card
const embed = new EmbedBuilder()
  .setColor('#3498db') // Set the embed color
  .setTitle('Summoning 3 cards:') // Set the title of the embed
  .setImage('attachment://card_1.png') // Set the image in the embed
  .setFooter({ text: 'Select a card using the buttons below.' }); // Add footer information

// Send the message with the embed and attachment
const reply = await msg.reply({
  embeds: [embed], // Include the embed
  files: [attachment], // Ensure files is an array
  components: [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: '1', // Button label for the first card
          custom_id: '1',
        },
        {
          type: 2,
          style: 1,
          label: '2', // Button label for the second card
          custom_id: '2',
        },
        {
          type: 2,
          style: 1,
          label: '3', // Button label for the third card
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
      const { cardPrint, cardCode, element } = cardData; // Added
    
      // Add card information to the database
      const userId = interaction.user.id;
      const cardName = selectedImages[parseInt(buttonId) - 1].name;
      const cardUrl = selectedImages[parseInt(buttonId) - 1].url;
      const series = selectedImages[parseInt(buttonId) - 1].series; // Get the series property
      

      const elementString = element ? getEmojiForElement(element) : 'unknown'; // Set default value if element is not defined
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
                console.log('Series:', series); // Add this to check the value of series before calling the function

                // Add card to the database
               // addCardToDatabase(userId, cardName, cardUrl, cardPrint, cardCode, series, element, cardData.baseElement);
               addCardToDatabase(
                userId, 
                cardName, 
                cardUrl, 
                cardPrint, 
                cardCode, 
                cardData.baseElement,  // this should be baseElement
                (error, result) => {
                    if (error) {
                        console.error('Error:', error);
                    } else {
                        console.log(result);
                    }
                }
            );
            
            
    
                try {
                  await interaction.deferUpdate();
                  const emojiForElement = getEmojiForElement(element);

                  const classEmojis = {
                    'Mage': '🧙‍♂️',
                    'Warrior': '⚔️',
                    'Tank': '🛡️',
                    'Gambler': '🎲',
                    'Engineer': '🔧',
                    'Rogue': '🗡️',
                    'N/A': '❓'
                  };

                  // query to get the class emoji from card_info table
const getClassEmojiQuery = 'SELECT class FROM card_info WHERE card_name = ?';
const getClassEmojiValues = [cardName];

connection.query(getClassEmojiQuery, getClassEmojiValues, async (classErr, classResults) => {
  if (classErr) {
    console.error('Error fetching class from database:', classErr.message);
  } else {
    const className = classResults.length > 0 ? classResults[0].class : 'N/A';
    const classEmoji = classEmojis[className] || classEmojis['N/A'];

    /*await interaction.channel.send(
      `🔔 <@${interaction.user.id}> **New Card Added to Your Inventory!** 🔔\n\n` +
      ` **Card:** "${cardName}" **#${cardPrint}**\n` +
      ` **Code:** \`${cardCode}\`\n` +
      ` **Series:** ${series}\n` +
      ` **Element:** ${element}\n` +
      ` **Base Element:** ${cardData.baseElement}\n` +
      ` **Class:** ${classEmoji} ${className}`
    );*/
    const { MessageEmbed } = require('discord.js');

const embed = new EmbedBuilder()
  .setColor('#3498db') // kolor embedu
  .setTitle('🔔 New Card Added to Your Inventory! 🔔')
  .setDescription(
    `<@${interaction.user.id}> "${cardName}" #${cardPrint} \`${cardCode}\` ` +
    `from \`${series}\`, Element: ${element}, Base Element: ${cardData.baseElement}, ` +
    `Class: ${classEmoji} ${className}`
  )
  //.setFooter('CardBot', 'https://example.com/icon.png') // opcjonalny footer z ikoną bota
  //.setTimestamp(); // dodaje datę i czas

await interaction.channel.send({ embeds: [embed] });

  }
});


                  //await interaction.channel.send(`<@${interaction.user.id}> "${cardName}" #${cardPrint} \`${cardCode}\` from \`${series}\` of ${element} element has been added to your inventory!\nBase Element: ${cardData.baseElement}`);
    
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
  } else if (startsWithCommand(msg.content, 'maddimage') && allowedUserIds.includes(msg.author.id)) {
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
      msg.reply('Invalid command format. Use maddimage <name> <url> <series> <🔥or🗿or💧or⚙️or⚡️or🌬️or💥or🌑or💡or🥊or🛡️>.');
    }
  
    return;
  } else if (startsWithCommand(msg.content, 'minventory') && !msg.interaction) {
      const userId = msg.author.id;
      let currentPage = 1;
      const cardsPerPage = 10;
      let inventoryMessage = null;
  
      // Parse the card name parameter from the command
      const match = msg.content.match(/name=(\S+)/);
      const cardName = match ? match[1] : null;
  
      // Generate unique button IDs based on user, command invocation time, and button type
      const buttonLeftId = `buttonLeft_${userId}_${Date.now()}_inventory`;
      const buttonRightId = `buttonRight_${userId}_${Date.now()}_inventory`;
  
      // Mapping of card classes to emojis
      const classEmojiMap = {
          'Mage': '🧙‍♂️',
          'Warrior': '⚔️',
          'Tank': '🛡️',
          'Gambler': '🎲',
          'Engineer': '🔧',
          'Rogue': '🗡️',
          'N/A': '❓', // For cards without a class assigned
      };
  
      const sendInventory = (page) => {
          let countQuery, query, values;
  
          // Count cards based on specified name or all cards
          if (cardName) {
              countQuery = 'SELECT COUNT(*) AS cardCount FROM card_inventory WHERE user_id = ? AND card_name = ?';
              query = 'SELECT * FROM card_inventory WHERE user_id = ? AND card_name = ? ORDER BY date_added DESC LIMIT ? OFFSET ?';
              values = [userId, cardName, cardsPerPage, (page - 1) * cardsPerPage];
          } else {
              countQuery = 'SELECT COUNT(*) AS cardCount FROM card_inventory WHERE user_id = ?';
              query = 'SELECT * FROM card_inventory WHERE user_id = ? ORDER BY date_added DESC LIMIT ? OFFSET ?';
              values = [userId, cardsPerPage, (page - 1) * cardsPerPage];
          }
  
          // Count the total number of cards
          connection.query(countQuery, [userId, cardName], (err, countResults) => {
              if (err) {
                  console.error('Error counting player cards:', err.message);
                  return;
              }
  
              const totalCards = countResults[0].cardCount;
              const totalPages = Math.ceil(totalCards / cardsPerPage);
              currentPage = Math.max(1, Math.min(totalPages, page));
  
              // Fetch the player's inventory cards
              connection.query(query, values, (err, results) => {
                  if (err) {
                      console.error('Error fetching player inventory:', err.message);
                      return;
                  }
  
                  if (results.length === 0) {
                      msg.reply(`Your inventory is empty.`);
                      return;
                  }
  
                  const cardNames = results.map(card => card.card_name);
                  const cardInfoQuery = `SELECT card_name, class FROM card_info WHERE card_name IN (?)`;
  
                  // Fetch additional card info
                  connection.query(cardInfoQuery, [cardNames], (err, cardInfoResults) => {
                      if (err) {
                          console.error('Error fetching card info:', err.message);
                          return;
                      }
  
                      const cardInfoMap = {};
                      // Map card names to their classes
                      cardInfoResults.forEach(info => {
                          cardInfoMap[info.card_name] = info.class;
                      });
  
                      let description = `You have ${totalCards} cards.`;
                      if (cardName) {
                          description = `You have ${totalCards} cards of type "${cardName}".`;
                      }
  
                      // Create an embed message for the inventory
                      const embed = new EmbedBuilder()
                          .setColor('#0099ff')
                          .setTitle(`Your Card Inventory - Page ${currentPage}/${totalPages}`)
                          .setDescription(description)
                          .addFields(
                              results.map((card) => {
                                  const cardClass = cardInfoMap[card.card_name] || 'N/A';
                                  const emoji = classEmojiMap[cardClass] || '❓'; // Add emoji for the class
                                  return {
                                      name: ` `,
                                      value: ` \`${card.card_code}\`  •  ${card.card_name}  •  #${card.card_print}  •  \`${card.series}\`  •  Class: ${cardClass} ${emoji}  •  Element: ${card.element} ${getEmojiForElement(card.element)}\nBase Element: ${card.base_element}`,
                                  };
                              })
                          );
  
                      // Define button components for pagination
                      const components = [
                          {
                              type: 1,
                              components: [
                                  {
                                      type: 2,
                                      style: currentPage === 1 ? 2 : 1, // Disable if on the first page
                                      label: '⬅️ Previous',
                                      customId: buttonLeftId,
                                      disabled: currentPage === 1,
                                  },
                                  {
                                      type: 2,
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
          });
      };
  
      // Handle button interactions
      client.on('interactionCreate', async (interaction) => {
          if (!interaction.isButton()) return;
  
          // Handle Left button
          if (interaction.customId === buttonLeftId) {
              interaction.deferred ? interaction.editReply('') : interaction.deferUpdate();
              sendInventory(currentPage - 1);
          }
  
          // Handle Right button
          if (interaction.customId === buttonRightId) {
              interaction.deferred ? interaction.editReply('') : interaction.deferUpdate();
              sendInventory(currentPage + 1);
          }
      });
  
      // Initial inventory display
      sendInventory(currentPage);
  } else if (matchesCommand(msg.content, 'mregister') && !msg.interaction) {
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
            }
        }
    });
  } else if (matchesCommand(msg.content, 'mhelp') && !msg.interaction) {
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
            { name: 'mshop', value: 'Show shop offerings', inline: true },
            { name: 'mscroll', value: 'Open scroll (containing random color)', inline: true },
            { name: 'mcardinfo <code>', value: 'Showing card statictics like element assigned special ability', inline: true},
            { name: 'msearch <card_name>', value: 'Searching for existing card in card pool - NOTE: name no need to be full, command ill show 10 cards closest for search name.', inline: true },
            { name: 'mdamage', value: 'Showing damage formula', inline: true},
            { name: 'madddescription', value:'Send description u wanna add for card, It ill be added if moderator ill approve it', inline: true},
            { name:'\u200B',value:'\u200B'},
            { name: 'maddimage <name> <url> <series> <element_emoji>', value: 'Add a new image to the card pool (admin only).', inline: true },
            { name: 'maddmoderator', value: 'Adding moderator (admin only)', inline: true },
        );

    msg.reply({ embeds: [embed] });
  } else if (startsWithCommand(msg.content, 'mview') && !msg.interaction) {
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
  } else if (startsWithCommand(msg.content, 'mremove') && !msg.interaction) {
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
  } else if (matchesCommand(msg.content, 'mitems') && !msg.interaction) {
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
                    );

                msg.reply({ embeds: [embed] });
            }
        }
    });
  } else if (matchesCommand(msg.content, 'mshop') && !msg.interaction) {
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
      .setFooter({ text: 'Happy shopping!' })
      .setTimestamp();
  
    msg.reply({ embeds: [embed] });
  } else if (startsWithCommand(msg.content, 'mbuy') && !msg.interaction) {
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
  } else if (matchesCommand(msg.content, 'mscroll') && !msg.interaction) {
    // Check if the user has scrolls
    const userId = msg.author.id;
    const scrollAmount = await getUserItemsAmount(userId, 'scroll');

    if (scrollAmount < 1) {
      msg.reply('You don\'t have any scrolls.');
      return;
    }

    // Generate a random color
    const randomColor = getRandomColor();

     // Save the generated color in the database
     await saveUserColor(userId, randomColor); // Replace `saveUserColor` with the actual function to save user color to the database

    // Create a canvas with a colored square
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = randomColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Convert canvas to buffer
    const buffer = canvas.toBuffer('image/png');

    // Send the buffer as an attachment
    msg.reply({
      content: `Your color is: ${randomColor}`,
      files: [{
        attachment: buffer,
        name: 'color.png',
      }],
    });

    // Update user's inventory (subtract 1 scroll)
    await updateUserItemsAmount(userId, 'scroll', scrollAmount - 1);
  } else if (startsWithCommand(msg.content, 'mcardinfo') && !msg.interaction) {
    const cardCode = msg.content.split(' ')[1];
    if (!cardCode) {
        msg.reply('Please provide a card code.');
        return;
    }

    const userId = msg.author.id;

    // Fetch card information, statistics, and class from the database
    const query = `
    SELECT ci.*, cs.*, c.class
    FROM card_inventory ci
    LEFT JOIN card_stats cs ON ci.card_code = cs.card_code
    LEFT JOIN card_info c ON ci.card_name = c.card_name
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
  } else if (startsWithCommand(msg.content, 'maddmoderator') && !msg.interaction) {
    // Check if the user executing the command has appropriate permissions
    if (msg.author.id !== allowedUserId) {
      msg.reply('You do not have permission to use this command.');
      return;
    }

    const args = msg.content.slice('maddmoderator'.length).trim().split(' ');

    if (args.length === 2) {
      const discordId = args[0];
      const discordUsertag = args[1];

      // Read existing content from the JSON file
      let moderatorsData;
      try {
        moderatorsData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
      } catch (error) {
        console.error('Error reading JSON file:', error.message);
        moderatorsData = [];
      }

      // Check if there is already an entry with this Discord ID
      const existingModerator = moderatorsData.find((moderator) => moderator.id === discordId);

      if (!existingModerator) {
        // Add a new moderator
        moderatorsData.push({ id: discordId, usertag: discordUsertag });

        // Save changes to the JSON file
        fs.writeFileSync(jsonFilePath, JSON.stringify(moderatorsData, null, 2));

        msg.reply(`Moderator added successfully: ${discordUsertag} (${discordId}).`);
      } else {
        msg.reply(`Moderator with ID ${discordId} already exists.`);
      }
    } else {
      msg.reply('Invalid command format. Use !maddmoderator <discord_id> <discord_usertag>.');
    }
  } else if (startsWithCommand(msg.content, 'msearch') && !msg.interaction) {
    // Check if the message content contains at least one word after the command
    //const args = msg.content.slice('msearch'.length).trim().split(' ');
    const matchedAlias = getMatchingAlias(msg.content, 'msearch');
    const args = msg.content.slice(matchedAlias.length).trim().split(' ');
    if (args.length < 1) {
        msg.reply('Please provide a character name.');
        return;
    }

    // Get the search phrase from the message content
    const searchTerm = args.join(' ');

    // Check if there is at least one character
    if (characters.length === 0) {
        msg.reply('No characters found.');
        return;
    }

    // Create a regular expression for searching character names
    const regex = new RegExp(searchTerm, 'i');

    // Filter characters whose name matches the entered phrase
    const filteredCharacters = characters.filter(
        (char) => char.name && regex.test(char.name.trim())
    );

    if (filteredCharacters.length === 0) {
        msg.reply('No characters found.');
    } else {
        const slicedCharacters = filteredCharacters.slice(0, 10);

        // If there is one matching character, send an Embed
        if (slicedCharacters.length === 1) {
            const character = slicedCharacters[0];

            // Create the Embed
            const embed = new EmbedBuilder()
                .setTitle('Selected Character')
                .setDescription(`**Name:** ${character.name}\n**Series:** ${character.series}\n**Base Element:** ${character.baseElement}`)
                .setImage(character.url);

            // Add description if available
            if (character.description) {
                embed.setDescription(`**Name:** ${character.name}\n**Series:** ${character.series}\n**Base Element:** ${character.baseElement}\n\n**Description:** ${character.description}`);
            } else {
                embed.addFields({ name: 'Description', value: 'No description available.' });
            }

            // Send the Embed
            msg.reply({ embeds: [embed] });
        } else {
            // If there are more than one matching characters, send a list with numbers
            const characterList = slicedCharacters.map(
                (char, index) => `${index + 1}. ${char.name} from ${char.series}`
            );

            // Send the list of characters
            msg.reply(`Multiple characters found. Please choose a number:\n${characterList.join('\n')}`);

            // Create a reaction collector
            const collector = msg.channel.createMessageCollector({
                filter: (response) => response.author.id === msg.author.id && /^\d+$/.test(response.content),
                time: 15000,
                max: 1,
            });

            collector.on('collect', (response) => {
                const choice = parseInt(response.content) - 1;
                const selectedCharacter = slicedCharacters[choice];

                // Create the Embed
                const embed = new EmbedBuilder()
                    .setTitle('Selected Character')
                    .setDescription(`**Name:** ${selectedCharacter.name}\n**Series:** ${selectedCharacter.series}\n**Base Element:** ${selectedCharacter.baseElement}`)
                    .setImage(selectedCharacter.url);

                // Add description if available
                if (selectedCharacter.description) {
                    embed.setDescription(`**Name:** ${selectedCharacter.name}\n**Series:** ${selectedCharacter.series}\n**Base Element:** ${selectedCharacter.baseElement}\n\n**Description:** ${selectedCharacter.description}`);
                } else {
                    embed.addFields({ name: 'Description', value: 'No description available.' });
                }

                // Send the Embed
                msg.reply({ embeds: [embed] });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    msg.reply('Time ran out. No character selected.');
                }
            });
        }
    }
  } else if (startsWithCommand(msg.content, 'madddescription') && !msg.interaction) {
    const usertag = msg.author.tag;
    const userId = msg.author.id;
    const channel_ = msg.channel.id;
    const serverChannel_ = msg.guild.channels.cache.get(channel_);

    // Check if the correct number of arguments is provided
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
    
            // Assign directly to globalData to avoid issues with names1
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
    
    // Wait for user response
    const filter = (response) => response.author.id === msg.author.id;
    const collector = msg.channel.createMessageCollector({ filter: filter, time: 60000 });
    
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

        // Check if a description for the card already exists
        const existingDescription = foundCard.description;

        if (existingDescription) {
            msg.reply('Description already exists for the specified card.');
            return;
        }

        // Check if the user has already added a description for this card
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
            // If the user does not want to add a description
            if (userResponse.toLowerCase() === 'no') {
                msg.reply('Adding description canceled.');
                collector.stop();
                return;
            } else if (userResponse.length < 20) {
                msg.reply('Description is too short!');
                return;
            } else if (userResponse.length >= 20) {
                // If the user sent a description (minimum 20 characters), send it to the specified channel
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
  } else if (startsWithCommand(msg.content, 'mtrade') && !msg.interaction) {
    const partialUsername = msg.content.slice('mtrade'.length).trim();

    if (!partialUsername) {
        return msg.reply('Please provide a username.');
    }

    await msg.guild.members.fetch();

    let mostSimilarUsername = null;
    let mostSimilarMember = null;

    msg.guild.members.cache.forEach(member => {
        if (!member.user.bot && member.id !== msg.author.id) {
            const username = member.user.username.toLowerCase();
            const displayName = member.displayName ? member.displayName.toLowerCase() : username;

            if (username.startsWith(partialUsername.toLowerCase()) || displayName.startsWith(partialUsername.toLowerCase())) {
                mostSimilarUsername = member.user.username;
                mostSimilarMember = member;
            }
        }
    });

    if (!mostSimilarUsername) {
        return msg.reply(`No similar username found for "${partialUsername}".`);
    }

    const tradeEmbed = new EmbedBuilder()
        .setColor('#778899')
        .setTitle('Trade Request')
        .setTimestamp()
        .setDescription(`${mostSimilarMember} do you want to trade with <@${msg.author.id}>?`);

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
    await tradeMessage.react('❌');

    const filterAccept = (reaction, user) => reaction.emoji.name === '✅' && (user.id === mostSimilarMember.id || user.id === debugUserId);
    const acceptCollector = tradeMessage.createReactionCollector({ filter: filterAccept, time: 60000 });

    acceptCollector.on('collect', async (reaction, user) => {
        const provideItemsEmbed1 = new EmbedBuilder()
            .setColor('#778899')
            .setTitle('Provide Items')
            .setDescription('Please provide item codes or names.');

        provideItemsMessage = await msg.channel.send({ embeds: [provideItemsEmbed1] }).catch(console.error);

        await provideItemsMessage.react('✅');
        await provideItemsMessage.react('❌');
        await provideItemsMessage.react('🔒');

        if (tradeMessage && !tradeMessage.deleted) {
            await tradeMessage.reactions.removeAll().catch(console.error);
        }

        const filterLockButton = (reaction, user) => reaction.emoji.name === '🔒' && (user.id === mostSimilarMember.id || user.id === msg.author.id || user.id === debugUserId);
        const lockButtonCollector = provideItemsMessage.createReactionCollector({ filter: filterLockButton, time: 60000 });
        const removingLockButtonCollector = provideItemsMessage.createReactionCollector({ filter: filterLockButton, time: 60000, dispose: true });

        let lockClicks = 0;

        removingLockButtonCollector.on('remove', async (reaction, user) => {
            if (user.id === debugUserId) {
                lockClicks -= 2;
            } else if (user.id === mostSimilarMember.id || user.id === msg.author.id) {
                lockClicks -= 1;
            }
            if (lockClicks < 0) lockClicks = 0;
        });

        lockButtonCollector.on('collect', async (reaction, user) => {
            if (user.id === debugUserId) {
                lockClicks += 2;
            } else if (user.id === mostSimilarMember.id || user.id === msg.author.id) {
                lockClicks += 1;
            }

            if (lockClicks > 1) {
                const provideItemsEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle(provideItemsMessage.embeds[0].title)
                    .setDescription(provideItemsMessage.embeds[0].description);

                await provideItemsMessage.edit({ embeds: [provideItemsEmbed] }).catch(console.error);

                await provideItemsMessage.react('✅');
                await provideItemsMessage.react('❌');
                await provideItemsMessage.react('🔒');
            }
        });

        const filterAcceptButton = (reaction, user) => reaction.emoji.name === '✅' && lockClicks > 1;
        const acceptButtonCollector = provideItemsMessage.createReactionCollector({ filter: filterAcceptButton, time: 60000 });

        acceptButtonCollector.on('collect', async (reaction, user) => {
            if (user.id === mostSimilarMember.id || user.id === debugUserId) {
                const provideItemsEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setDescription(provideItemsMessage.embeds[0].description);

                await provideItemsMessage.edit({ embeds: [provideItemsEmbed] }).catch(console.error);
            }
        });

        const filterCodeMessages = msg => isValidCardCode(msg.content.trim()) && !msg.author.bot;
        const codeCollector = msg.channel.createMessageCollector({ filter: filterCodeMessages, time: 60000 });

        codeCollector.on('collect', async message => {
            const cardCode = message.content.trim();
            const userId = message.author.id;
            const mentionedUserId = mostSimilarMember.id;

            try {
                const card = await getCardFromDatabase(cardCode, mentionedUserId ? mentionedUserId : userId);

                if (card) {
                    if (mentionedUserId === userId) {
                        player1CardCodes.push(cardCode);
                    } else {
                        player2CardCodes.push(cardCode);
                    }

                    await updateProvideItemsMessage();
                } else {
                    await message.channel.send('The provided card code does not exist in the user inventory.');
                }
            } catch (error) {
                console.error('Error fetching card from database:', error);
                await message.channel.send('An error occurred while fetching the card from the database.');
            }
        });
    });

    const filterDeclineButton = (reaction, user) => reaction.emoji.name === '❌';
    const declineButtonCollector = tradeMessage.createReactionCollector({ filter: filterDeclineButton, time: 60000 });

    declineButtonCollector.on('collect', async (reaction, user) => {
        if (user.id === mostSimilarMember.id || user.id === debugUserId) {
            tradeEmbed.setColor('#FF0000')
                .setTitle('Canceled')
                .setDescription(`Trade with ${mostSimilarUsername} has been canceled.`);
            await tradeMessage.edit({ embeds: [tradeEmbed] }).catch(console.error);

            if (tradeMessage && !tradeMessage.deleted) {
                await tradeMessage.reactions.removeAll().catch(console.error);
            }
        }
    });

    async function updateProvideItemsMessage() {
        const newEmbed = generateProvideItemsEmbed();

        if (provideItemsMessage) {
            await provideItemsMessage.edit({ embeds: [newEmbed] });
        } else {
            provideItemsMessage = await msg.channel.send({ embeds: [newEmbed] });
        }
    }

    lastTradeAuthor = msg.author.username;
  } else if (startsWithCommand(msg.content, 'mdamage') && !msg.interaction) {
    const damageFormulaImageUrl = 'https://i.imgur.com/4b1Hfb9.png';

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

    msg.channel.send({ embeds: [embed] });
  } else if (matchesCommand(msg.content, 'mhexes') && !msg.interaction) {
        // Get the user's color codes from the database
        getUserColorCodes(msg.author.id)
            .then(colorCodes => {
                if (colorCodes && colorCodes.length > 0) {
                    // Format color codes with backticks and color names
                    const formattedCodes = colorCodes.map(code => `\`${code}\` (${categorizeColor(code)})`).join(', ');

                    // Create an embed to display the user's color codes
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Your Color Codes')
                        .setDescription('Here are your color codes:')
                        .addFields({
                            name: 'Color Codes:',
                            value: formattedCodes
                        })
                        .setTimestamp();

                    // Respond with the embed
                    msg.reply({ embeds: [embed] });
                } else {
                    // Respond if the user has no color codes in the database
                    msg.reply('You have no color codes in the database.');
                }
            })
            .catch(error => {
                console.error('Error retrieving user color codes:', error);
                msg.reply('An error occurred while retrieving your color codes.');
            });
  } else if (startsWithCommand(msg.content, 'mhex') && !msg.interaction) {
    // Extract the code from the message content
    const parts = msg.content.split(' ');
    const code = parts[1];

    // Check if the user provided a code
    if (!code) {
        msg.reply('Please provide a code.');
        return;
    }

    // Check if the provided code is a valid hex color code
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(code)) {
        msg.reply('Invalid hex color code. Please provide a valid code.');
        return;
    }

    // Create a canvas with a colored square using the provided hex color code
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = code; // Use the provided hex color code
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
  } else if (startsWithCommand(msg.content, 'muse') && !msg.interaction) {
    const args = msg.content.trim().split(/ +/);
    const command = args.shift().toLowerCase(); // Remove "muse" from args

    if (command === 'muse') {
        const hexCode = args[0];
        const cardCode = args[1];
        if (!hexCode || !cardCode) {
            return msg.reply('Please use the command in the format: `muse hex_code card_code`');
        }

        // Check if the card exists in the database
        pool.query('SELECT * FROM card_inventory WHERE card_code = ?', [cardCode], (error, results) => {
            if (error) {
                console.error('Error while checking the card in the database:', error);
                return;
            }
            if (results.length === 0) {
                return msg.reply('Could not find a card with the provided code.');
            }

            // Call the function to change the card frame color
            changeCardFrameColor(hexCode, cardCode);
            msg.reply(`Changed the frame color of card ${cardCode}.`);
        });
    }
  } else if (startsWithCommand(msg.content, 'minvade') && !msg.interaction) {

    // send initial embed with image and buttons
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Invasion [PVE]')
      .setDescription('Choose dungeon.')
      .setImage('https://cdn.discordapp.com/attachments/1235003522307850302/1301551872661782538/2.png?ex=6724e424&is=672392a4&hm=49d23b20e477cbd699605d36c49e63d3dee1484651d6821a32901ec3b25383e1&')
      .setTimestamp();
  
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('egypt')
          .setLabel('Stronghold')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('poland')
          .setLabel('Gambler\'s Nest')
          .setStyle(ButtonStyle.Primary)
      );
  
    const message = await msg.channel.send({ embeds: [embed], components: [row] });
  
    // interaction collector for button clicks
    const filter = (interaction) => ['egypt', 'poland'].includes(interaction.customId) && interaction.user.id === msg.author.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });
  
    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'poland') {
        // update embed and buttons for Poland
        const newEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('Poland Invasion [PVE]')
          .setDescription('You have chosen to invade Poland! Prepare for battle.')
          .setImage('https://cdn.discordapp.com/attachments/1235003522307850302/1301481556967424050/111.png?ex=6724a2a7&is=67235127&hm=59785f4d312d578114dacdc68fef81169d36c0a17083ac96061d82642516e6fe&') // Replace with Poland image URL
          .setTimestamp();
  
        const newRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('easyPL')
              .setLabel('Easy')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('hardPL')
              .setLabel('Hard')
              .setStyle(ButtonStyle.Secondary)
          );
  
        await interaction.update({ embeds: [newEmbed], components: [newRow] });
      }else if (interaction.customId === 'egypt') {
        // update embed and buttons for Egypt
        const newEmbed = new EmbedBuilder()
          .setColor('#ffd700')
          .setTitle('Egypt Invasion [PVE]')
          .setDescription('You have chosen to invade Egypt! Get ready to country of frogs.')
          .setImage('https://imgs.search.brave.com/svzXLIAXIkmDyoeyIn9JKxdgxZOWdURHqBkGZ87usyo/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/YnJpdGFubmljYS5j/b20vODYvMTg2LTA1/MC03NEQ1NDczNS9t/YXAtRWd5cHQtYm9y/ZGVyLWFyZWFzLWNv/dW50cnktU3VkYW4u/anBnP3c9NDAwJmg9/MzAwJmM9Y3JvcA') // Replace with Egypt image URL
          .setTimestamp();
  
        const newRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('easyEG')
              .setLabel('Easy')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('hardEG')
              .setLabel('Hard')
              .setStyle(ButtonStyle.Secondary)
          );
  
        await interaction.update({ embeds: [newEmbed], components: [newRow] });
      }
      

      const cfilter = (interaction) => ['hardPL', 'hardEG', 'easyPL', 'easyEG'].includes(interaction.customId) && interaction.user.id === msg.author.id;
    const ccollector = message.createMessageComponentCollector({ cfilter, time: 60000 });
      ccollector.on('collect', async (interaction) => {
        
            if (interaction.customId === 'hardPL' || interaction.customId === 'hardEG') {
                const newEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('Error [PVE]')
                    .setDescription('You can\'t invade on this difficulty, try again on a lower difficulty.')
                    .setTimestamp();
    
                await interaction.update({ embeds: [newEmbed], components: [] });
            } else if (interaction.customId === 'easyPL') {
                const newEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('Poland Invasion [Easy]')
                    .setDescription('Pls provide code of card that will invade Poland');
    
                await interaction.update({ embeds: [newEmbed], components: [] });
            } else if (interaction.customId === 'easyEG') {
                const newEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('Egypt Invasion [Easy]')
                    .setDescription('Pls provide code of card that will invade Egypt');

                await interaction.update({ embeds: [newEmbed], components: [] });
            }
            
      
    });
    
    
    });

     codeFilter = (m) => m.author.id === userId; 
    const codeCollector = msg.channel.createMessageCollector({ codeFilter, time: 15000 });
    codeCollector.on('collect', async (m) => {


      const userId = msg.author.id;
      const cardCode = m.content;
      console.log(cardCode);
      console.log(userId);
      
      try {
        // Query to find the card associated with the user
        const results = await connection.promise().query('SELECT card_name, card_code FROM card_inventory WHERE user_id = ? AND card_code = ?', [userId, cardCode]);
    
        // Check if results contain any rows
        if (results[0].length > 0) {
            //m.reply(`You have chosen to invade Poland with card ${results[0][0].card_name}.`);

            const newEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('⚔️Invasion started')
                    .setDescription(`${results[0][0].card_name} has been sent to War!\nYou can't use this card for next 24 hours!`)
                    .setTimestamp();
    
                await m.reply({ embeds: [newEmbed], components: [] });
            codeCollector.stop();
        } else {
            return
        }
    } catch (error) {
        console.error('Error fetching card from database:', error);
    }
    
    
    codeCollector.on('end', collected => {
      if (collected.size > 0) {
          console.log(`Collected ${collected.size} message(s).`);
      } else {
          console.log('No messages collected.');
      }
  });
    


    })
  
      collector.on('end', () => {
      // disable buttons after timeout
      message.edit({ components: [] });
    });
  }


});

function changeCardFrameColor(hexCode, cardCode) {
    // Aktualizacja koloru ramki w bazie danych
    connection.query('UPDATE card_inventory SET frame_color = ?, default_frame = ? WHERE card_code = ?', [hexCode, 0, cardCode], (error, results) => {
        if (error) {
            console.error('Błąd podczas aktualizacji koloru ramki w bazie danych:', error);
            return;
        }
        console.log('Zaktualizowano kolor ramki dla karty', cardCode);
    });
}

/////////////////////
// Function to fetch user color codes from MySQL database
function getUserColorCodes(userId) {
    return new Promise((resolve, reject) => {
        pool.query('SELECT color FROM user_colors WHERE user_id = ?', [userId], (error, results) => {
            if (error) {
                reject(error);
            } else {
                const colorCodes = results.map(result => result.color);
                resolve(colorCodes);
            }
        });
    });
}

// Function to convert hex to RGB
function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    return { r, g, b };
}

// Function to convert RGB to HSL
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

// Function to categorize color based on hue
function categorizeColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const { h } = rgbToHsl(r, g, b);

    if (h >= 0 && h < 30) return 'Red';
    if (h >= 30 && h < 60) return 'Orange';
    if (h >= 60 && h < 90) return 'Yellow';
    if (h >= 90 && h < 150) return 'Green';
    if (h >= 150 && h < 210) return 'Cyan';
    if (h >= 210 && h < 270) return 'Blue';
    if (h >= 270 && h < 330) return 'Purple';
    return 'Red'; // Covers from 330 to 360
}

async function getUserColor(userId) {
  return new Promise((resolve, reject) => {
      const query = 'SELECT color FROM user_colors WHERE user_id = ?';
      connection.query(query, [userId], function(error, results, fields) {
          if (error) {
              reject(error);
              return;
          }

          if (results.length > 0) {
              resolve(results[0].color);
          } else {
              resolve(null);
          }
      });
  });
}

async function getUserColorCodes(userId) {
  return new Promise((resolve, reject) => {
      const query = 'SELECT color FROM user_colors WHERE user_id = ?';
      connection.query(query, [userId], function(error, results, fields) {
          if (error) {
              reject(error);
              return;
          }

          const colorCodes = results.map(result => result.color);
          resolve(colorCodes);
      });
  });
}


// Interaction event
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

          const replyContent = `<@${user_id}> your card description has been declined by a moderator. Make sure your description follows the rules! If the description is inaccurate, contains offensive language, or is too long, it will be declined. Thank you and good luck next time!`;
          return await serverChannel1.send(replyContent);
      });
  } else if (interaction.customId === 'confirm') {
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

          const imageUrlsPath = 'imageUrls.json';
          let imageUrlsData = JSON.parse(fs.readFileSync(imageUrlsPath, 'utf8'));

          const compareIgnoreCase = (str1, str2) => str1.localeCompare(str2, undefined, { sensitivity: 'base' });

          const serverChannelId1 = '1203803520998969344';
          const serverChannel1 = interaction.guild.channels.cache.get(serverChannelId1);

          const replyContent = `<@${user_id}> your card description has been accepted by a moderator. Congrats, you are now part of this project! Thank you!`;
          await serverChannel1.send(replyContent);
      });
  }
});

// Function to check if a user is a moderator
function isModerator(userId) {
  const moderatorsFilePath = './moderators.json';

  // Check if the moderators.json file exists
  if (!fs.existsSync(moderatorsFilePath)) {
    console.error('Moderators file does not exist.');
    return false;
  }

  // Read moderators data from file
  const moderatorsData = JSON.parse(fs.readFileSync(moderatorsFilePath, 'utf8'));

  // Check if the user is a moderator
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
    // 1-5
    [`${emojiMap.fire}_${emojiMap.earth}`]: { 
      name: 'Cinderclad Rupture', 
      description: `Abilities descriptions not added yet`  
    },
    [`${emojiMap.earth}_${emojiMap.fire}`]: { 
      name: 'Cinderclad Rupture', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.fire}_${emojiMap.water}`]: { 
      name: 'Mistral Confluence', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.water}_${emojiMap.fire}`]: { 
      name: 'Mistral Confluence', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.fire}_${emojiMap.metal}`]: { 
      name: 'Ferric Blaze', 
      description: `Abilities descriptions not added yet` 
    },
    
    // 6-10
    [`${emojiMap.metal}_${emojiMap.fire}`]: { 
      name: 'Ferric Blaze', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.fire}_${emojiMap.electricity}`]: { 
      name: 'Electric Inferno', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.electricity}_${emojiMap.fire}`]: { 
      name: 'Electric Inferno', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.fire}_${emojiMap.wind}`]: { 
      name: 'Blazing Gale', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.wind}_${emojiMap.fire}`]: { 
      name: 'Blazing Gale', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 11-15
    [`${emojiMap.fire}_${emojiMap.overpowered}`]: { 
      name: 'Overcharged Inferno', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.overpowered}_${emojiMap.fire}`]: { 
      name: 'Overcharged Inferno', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.earth}_${emojiMap.water}`]: { 
      name: 'Mudslide', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.water}_${emojiMap.earth}`]: { 
      name: 'Mudslide', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.earth}_${emojiMap.metal}`]: { 
      name: 'Sharp Pebble', 
      description: `Abilities descriptions not added yet` 
    },
    
    // 16-20
    [`${emojiMap.metal}_${emojiMap.earth}`]: { 
      name: 'Sharp Pebble', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.earth}_${emojiMap.electricity}`]: { 
      name: 'Electrified Terrain', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.electricity}_${emojiMap.earth}`]: { 
      name: 'Electrified Terrain', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.earth}_${emojiMap.wind}`]: { 
      name: 'Turbulent Tremor', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.wind}_${emojiMap.earth}`]: { 
      name: 'Turbulent Tremor', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 21-25
    [`${emojiMap.earth}_${emojiMap.overpowered}`]: { 
      name: 'Overwhelming Quake', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.overpowered}_${emojiMap.earth}`]: { 
      name: 'Overwhelming Quake', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.water}_${emojiMap.metal}`]: { 
      name: 'Razor Torrent', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.metal}_${emojiMap.water}`]: { 
      name: 'Razor Torrent', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.water}_${emojiMap.electricity}`]: { 
      name: 'Shockwave Surge', 
      description: `Abilities descriptions not added yet` 
    },
    
    // 26-30
    [`${emojiMap.electricity}_${emojiMap.water}`]: { 
      name: 'Shockwave Surge', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.water}_${emojiMap.wind}`]: { 
      name: 'Tempest Tide', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.wind}_${emojiMap.water}`]: { 
      name: 'Tempest Tide', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.water}_${emojiMap.overpowered}`]: { 
      name: 'Overwhelming Deluge', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.overpowered}_${emojiMap.water}`]: { 
      name: 'Overwhelming Deluge', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 31-35
    [`${emojiMap.metal}_${emojiMap.electricity}`]: { 
      name: 'Conductive Shock', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.electricity}_${emojiMap.metal}`]: { 
      name: 'Conductive Shock', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.metal}_${emojiMap.wind}`]: { 
      name: 'Cyclonic Shrapnel', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.wind}_${emojiMap.metal}`]: { 
      name: 'Cyclonic Shrapnel', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.metal}_${emojiMap.overpowered}`]: { 
      name: 'Overcharged Shrapnel', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 36-40
    [`${emojiMap.overpowered}_${emojiMap.metal}`]: { 
      name: 'Overcharged Shrapnel', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.electricity}_${emojiMap.wind}`]: { 
      name: 'Static Cyclone', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.wind}_${emojiMap.electricity}`]: { 
      name: 'Static Cyclone', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.electricity}_${emojiMap.overpowered}`]: { 
      name: 'Overcharged Storm', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.overpowered}_${emojiMap.electricity}`]: { 
      name: 'Overcharged Storm', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 41-45
    [`${emojiMap.wind}_${emojiMap.overpowered}`]: { 
      name: 'Overwhelming Gust', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.overpowered}_${emojiMap.wind}`]: { 
      name: 'Overwhelming Gust', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.dark}_${emojiMap.light}`]: { 
      name: 'Eclipse', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.light}_${emojiMap.dark}`]: { 
      name: 'Eclipse', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.dark}_${emojiMap.overpowered}`]: { 
      name: 'Overwhelming Void', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 46-50
    [`${emojiMap.overpowered}_${emojiMap.dark}`]: { 
      name: 'Overwhelming Void', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.overpowered}`]: { 
      name: 'Overwhelming Radiance', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.overpowered}_${emojiMap.light}`]: { 
      name: 'Overwhelming Radiance', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.fire}_${emojiMap.fighting}`]: { 
      name: 'Blaze Combo', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.fighting}_${emojiMap.fire}`]: { 
      name: 'Blaze Combo', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 51-55
    [`${emojiMap.water}_${emojiMap.fighting}`]: { 
      name: 'Aqua Barrage', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.fighting}_${emojiMap.water}`]: { 
      name: 'Aqua Barrage', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.wind}_${emojiMap.fighting}`]: { 
      name: 'Tempest Strike', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.fighting}_${emojiMap.wind}`]: { 
      name: 'Tempest Strike', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.earth}_${emojiMap.fighting}`]: { 
      name: 'Tectonic Uppercut', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 56-60
    [`${emojiMap.fighting}_${emojiMap.earth}`]: { 
      name: 'Tectonic Uppercut', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.electricity}_${emojiMap.fighting}`]: { 
      name: 'Thunderous Punch', 
      description: `Abilities descriptions not added yet`  
    },
    [`${emojiMap.fighting}_${emojiMap.electricity}`]: { 
      name: 'Thunderous Punch', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.metal}_${emojiMap.fighting}`]: { 
      name: 'Iron Fist', 
      description: `Abilities descriptions not added yet`  
    },
    [`${emojiMap.fighting}_${emojiMap.metal}`]: { 
      name: 'Iron Fist', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 61-65
    [`${emojiMap.dark}_${emojiMap.fighting}`]: { 
      name: 'Shadow Strike', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.fighting}_${emojiMap.dark}`]: { 
      name: 'Shadow Strike', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.fighting}`]: { 
      name: 'Radiant Uppercut', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.fighting}_${emojiMap.light}`]: { 
      name: 'Radiant Uppercut', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.fire}_${emojiMap.neutral}`]: { 
      name: 'Neutral Flame', 
      description: `Abilities descriptions not added yet` 
    },
    
    // 66-70
    [`${emojiMap.neutral}_${emojiMap.fire}`]: { 
      name: 'Neutral Flame', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.earth}_${emojiMap.neutral}`]: { 
      name: 'Neutral Earth', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.neutral}_${emojiMap.earth}`]: { 
      name: 'Neutral Earth', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.water}_${emojiMap.neutral}`]: { 
      name: 'Neutral Water', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.neutral}_${emojiMap.water}`]: { 
      name: 'Neutral Water', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.wind}_${emojiMap.neutral}`]: { 
      name: 'Neutral Wind', 
      description: `Abilities descriptions not added yet` 
    },
    
    // 71-75
    [`${emojiMap.neutral}_${emojiMap.wind}`]: { 
      name: 'Neutral Wind', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.electricity}_${emojiMap.neutral}`]: { 
      name: 'Neutral Electricity', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.neutral}_${emojiMap.electricity}`]: { 
      name: 'Neutral Electricity', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.metal}_${emojiMap.neutral}`]: { 
      name: 'Neutral Metal', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.neutral}_${emojiMap.metal}`]: { 
      name: 'Neutral Metal', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 76-80
    [`${emojiMap.dark}_${emojiMap.neutral}`]: { 
      name: 'Neutral Darkness', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.neutral}_${emojiMap.dark}`]: { 
      name: 'Neutral Darkness', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.neutral}`]: { 
      name: 'Neutral Light', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.neutral}_${emojiMap.light}`]: { 
      name: 'Neutral Light', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.neutral}_${emojiMap.neutral}`]: { 
      name: 'Perfect Balance', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 81-85
    [`${emojiMap.neutral}_${emojiMap.neutral}`]: { 
      name: 'Perfect Balance', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.overpowered}`]: { 
      name: 'Overwhelming Radiance', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.overpowered}_${emojiMap.light}`]: { 
      name: 'Overwhelming Radiance', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.dark}_${emojiMap.light}`]: { 
      name: 'Eclipse', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.light}_${emojiMap.dark}`]: { 
      name: 'Eclipse', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.dark}_${emojiMap.overpowered}`]: { 
      name: 'Overwhelming Void', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 86-90
    [`${emojiMap.overpowered}_${emojiMap.dark}`]: { 
      name: 'Overwhelming Void', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.dark}`]: { 
      name: 'Shadow Radiance', 
      description: `Abilities descriptions not added yet` 
    },
    [`${emojiMap.dark}_${emojiMap.light}`]: { 
      name: 'Shadow Radiance', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.light}`]: { 
      name: 'Dual Luminance', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.dark}_${emojiMap.dark}`]: { 
      name: 'Dual Shadows', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.electricity}_${emojiMap.electricity}`]: { 
      name: 'Electric Surge', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 91-95
    [`${emojiMap.metal}_${emojiMap.metal}`]: { 
      name: 'Metallic Barrage', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.earth}_${emojiMap.earth}`]: { 
      name: 'Terraquake', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.water}_${emojiMap.water}`]: { 
      name: 'Hydro Torrent', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.fire}_${emojiMap.fire}`]: { 
      name: 'Flame Burst', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.wind}_${emojiMap.wind}`]: { 
      name: 'Gust Surge', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 96-100
    [`${emojiMap.electricity}_${emojiMap.dark}`]: { 
      name: 'Voltage Veil', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.dark}_${emojiMap.electricity}`]: { 
      name: 'Voltage Veil', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.electricity}_${emojiMap.light}`]: { 
      name: 'Luminous Shock', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.electricity}`]: { 
      name: 'Luminous Shock', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.metal}_${emojiMap.light}`]: { 
      name: 'Shiny Armor', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 101-105
    [`${emojiMap.light}_${emojiMap.metal}`]: { 
      name: 'Shiny Armor', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.dark}_${emojiMap.metal}`]: { 
      name: 'Dark Metal', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.metal}_${emojiMap.dark}`]: { 
      name: 'Dark Metal', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.wind}_${emojiMap.dark}`]: { 
      name: 'Dark Gale', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.dark}_${emojiMap.wind}`]: { 
      name: 'Dark Gale', 
      description: `Abilities descriptions not added yet` 
    },
  
    // 106-110
    [`${emojiMap.dark}_${emojiMap.neutral}`]: { 
      name: 'Neutral Darkness', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.neutral}_${emojiMap.dark}`]: { 
      name: 'Neutral Darkness', 
      description: `Abilities descriptions not added yet` 
    },
  
    [`${emojiMap.light}_${emojiMap.neutral}`]: { 
      name: 'Neutral Light', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.neutral}_${emojiMap.light}`]: { 
      name: 'Neutral Light', 
      description: `Abilities descriptions not added yet` 
    },
    
    [`${emojiMap.dark}_${emojiMap.dark}`]: { 
      name: 'Dual Shadows', 
      description: `Abilities descriptions not added yet` 
    },
  };
  

  const key = `${element}_${baseElement}`;
  return abilities[key] || { name: 'No special ability', description: 'Elements combo for this card don\'t have special ability' };
}

// Function to create embed for card information
function createCardInfoEmbed(cardInfo) {
  // Emoji representations for statistics
  const emojiMap = {
      strength: '💪',
      defense: '🛡️',
      agility: '🏃',
      wisdom: '🧠',
      energy: '⚡',
      luck: '🍀',
      'Mage': '🧙‍♂️',
      'Warrior': '⚔️',
      'Tank': '🛡️',
      'Gambler': '🎲',
      'Engineer': '🔧',
      'Rogue': '🗡️',
      'N/A': '❓',
  };

  const centeredTitle = `**    ${cardInfo.card_name}** \u2022 ${cardInfo.series || 'N/A'}`;

  const specialAbility = generateSpecialAbility(cardInfo.element, cardInfo.base_element);
  const abilityValue = `**Name:** ${specialAbility.name}\n**Description:** ${specialAbility.description}`;

  // Get the emoji for the class
  const classEmoji = emojiMap[cardInfo.class] || emojiMap['N/A'];

  return {
      color: 0x0099ff,
      title: centeredTitle,
      fields: [
          { name: 'Elements', value: `${cardInfo.element || 'N/A'} \u2022 ${cardInfo.base_element || 'N/A'}` },
          {
              name: 'Class',
              value: `${classEmoji} ${cardInfo.class || 'N/A'}`, // Dodano emoji klasy
          },
          {
              name: 'Stats',
              value: `**STR:** ${cardInfo.strength !== null ? cardInfo.strength + emojiMap.strength : 'N/A'} | **DEF:** ${cardInfo.defense !== null ? cardInfo.defense + emojiMap.defense : 'N/A'} | **AGI:** ${cardInfo.agility !== null ? cardInfo.agility + emojiMap.agility : 'N/A'}
              **WIS:** ${cardInfo.wisdom !== null ? cardInfo.wisdom + emojiMap.wisdom : 'N/A'} | **ENG:** ${cardInfo.energy !== null ? cardInfo.energy + emojiMap.energy : 'N/A'} | **LCK:** ${cardInfo.luck !== null ? cardInfo.luck + emojiMap.luck : 'N/A'}`,
          },
          { name: 'Special Ability', value: abilityValue },
      ],
      image: { url: cardInfo.card_url },
      footer: { text: 'Legend:\n STR (Strength), DEF (Defense),\nAGI (Agility), WIS (Wisdom),\nENG (Energy), LCK (Luck)' }
  };
}



// Function to get emoji for an element
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

// Function to get user's item amount from database
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


// Function to get a random element with given chances
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

  // Return default element in case of any error
  return elements[0];
}

// Function to add card information to the database
function addCardInfoToDatabase(cardName, latestPrint) {
  const query = 'INSERT INTO card_info (card_name, latest_print, ) VALUES (?, ?)';
  const values = [cardName, latestPrint];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error adding card info to database:', err.message);
    } else {
      console.log('Card info added to database:', results);
    }
  });
}

// Function to update user's item amount in the database
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

// Function to generate a random color in hex format
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Function to get user data from the database
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


// Function to deduct item from user's inventory
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

// Function to add item to user's inventory
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

// Function to get random images
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

// Function to save updated imageUrls to file
function saveUpdatedImageUrls() {
  try {
    // Save the images to the file
    fs.writeFileSync(imageUrlsPath, JSON.stringify(imageUrls, null, 2));
    console.log('ImageUrls updated successfully.');
  } catch (error) {
    console.error('Error saving updated imageUrls:', error.message);
  }
}

// Function to add player to database
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


// Function to get a random number within a specified range
function getRandomNumberInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Function to add card to the database
/*function addCardToDatabase(userId, cardName, cardUrl, cardPrint, cardCode, baseElement) {
  const queryClass = 'SELECT class FROM card_info WHERE card_name = ?';
  connection.query(queryClass, [cardName], (error, results) => {
      if (error) {
          console.error('Error fetching class name:', error);
          return; // Zakończ, jeśli wystąpił błąd
      }

      let className;
      if (results.length > 0) {
          className = results[0].class;
      } else {
          console.log('No class found for this card name.');
          return; // Zakończ, jeśli nie znaleziono klasy
      }

      // Find the image object with the matching name in imageUrls
      const imageObject = imageUrls.find((image) => image.name === cardName);
      const series = imageObject && imageObject.series ? imageObject.series : 'default_series';

      const elements = ['🔥', '🗿', '💧', '⚙️', '⚡', '🌬️', '💥', '🌑', '💡', '🥊', '🛡️'];

      // Randomly choose an element with specified chances
      const randomElement = getRandomElementWithChances(elements, [9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 5, 9.5, 9.5, 9.5, 9.5]);

      // Randomly generate base statistics
      let strength = getRandomNumberInRange(10, 100);
      let defense = getRandomNumberInRange(5, 50);
      let agility = getRandomNumberInRange(5, 30);
      let wisdom = getRandomNumberInRange(1, 20);
      let energy = getRandomNumberInRange(10, 50);
      let luck = getRandomNumberInRange(1, 10);

      // Boost stats based on class
      switch (className) {
          case 'Warrior':
              strength += 30;  // Główna cecha - duży wzrost
              defense += 15;   // Medium boost (normal)
              agility += 5;    // Small boost (half of normal)
              break;
          case 'Tank':
              defense += 30;   // Główna cecha - duży wzrost
              strength += 15;   // Medium boost (normal)
              wisdom += 5;     // Small boost (half of normal)
              break;
          case 'Rogue':
              agility += 30;   // Główna cecha - duży wzrost
              luck += 15;      // Medium boost (normal)
              energy += 5;     // Small boost (half of normal)
              break;
          case 'Mage':
              wisdom += 30;    // Główna cecha - duży wzrost
              energy += 20;    // High boost (normal)
              defense += 5;    // Small boost (half of normal)
              break;
          case 'Engineer':
              energy += 30;    // Główna cecha - duży wzrost
              wisdom += 20;    // High boost (normal)
              luck += 5;       // Small boost (half of normal)
              break;
          case 'Gambler':
              luck += 30;      // Główna cecha - duży wzrost
              agility += 15;   // Medium boost (normal)
              strength += 5;   // Small boost (half of normal)
              break;
          default:
              console.log("Invalid class name.");
      }

      const queryInventory = 'INSERT INTO card_inventory (user_id, card_name, card_url, card_print, card_code, series, element, base_element, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())';
      const valuesInventory = [userId, cardName, cardUrl, cardPrint, cardCode, series, randomElement, baseElement];

      const queryStats = 'INSERT INTO card_stats (card_code, strength, defense, agility, wisdom, energy, luck) VALUES (?, ?, ?, ?, ?, ?, ?)';
      const valuesStats = [cardCode, strength, defense, agility, wisdom, energy, luck];

      // Insert into card_inventory
      connection.query(queryInventory, valuesInventory, (err, results) => {
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
  });
}*/
function addCardToDatabase(userId, cardName, cardUrl, cardPrint, cardCode, baseElement, callback) {
  const queryClass = 'SELECT class FROM card_info WHERE card_name = ?';
  
  connection.query(queryClass, [cardName], (error, results) => {
      if (error) {
          console.error('Error fetching class name:', error);
          if (callback) callback(error); // Pass the error to the callback
          return; // Exit if an error occurred
      }

      let className;
      if (results.length > 0) {
          className = results[0].class;
      } else {
          console.log('No class found for this card name.');
          if (callback) callback(new Error('No class found for this card name.')); // Pass the error to the callback
          return; // Exit if no class found
      }

      // Find the image object with the matching name in imageUrls
      const imageObject = imageUrls.find((image) => image.name === cardName);
      const series = imageObject && imageObject.series ? imageObject.series : 'default_series';

      const elements = ['🔥', '🗿', '💧', '⚙️', '⚡', '🌬️', '💥', '🌑', '💡', '🥊', '🛡️'];

      // Randomly choose an element with specified chances
      const randomElement = getRandomElementWithChances(elements, [9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 5, 9.5, 9.5, 9.5, 9.5]);

      // Randomly generate base statistics
      let strength = getRandomNumberInRange(10, 100);
      let defense = getRandomNumberInRange(5, 50);
      let agility = getRandomNumberInRange(5, 30);
      let wisdom = getRandomNumberInRange(1, 20);
      let energy = getRandomNumberInRange(10, 50);
      let luck = getRandomNumberInRange(1, 10);

      // Boost stats based on class
      switch (className) {
          case 'Warrior':
              strength += 30;
              defense += 15;
              agility += 5;
              break;
          case 'Tank':
              defense += 30;
              strength += 15;
              wisdom += 5;
              break;
          case 'Rogue':
              agility += 30;
              luck += 15;
              energy += 5;
              break;
          case 'Mage':
              wisdom += 30;
              energy += 20;
              defense += 5;
              break;
          case 'Engineer':
              energy += 30;
              wisdom += 20;
              luck += 5;
              break;
          case 'Gambler':
              luck += 30;
              agility += 15;
              strength += 5;
              break;
          default:
              console.log("Invalid class name.");
              if (callback) callback(new Error("Invalid class name.")); // Pass the error to the callback
              return; // Exit if class name is invalid
      }

      const queryInventory = 'INSERT INTO card_inventory (user_id, card_name, card_url, card_print, card_code, series, element, base_element, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())';
      const valuesInventory = [userId, cardName, cardUrl, cardPrint, cardCode, series, randomElement, baseElement];

      const queryStats = 'INSERT INTO card_stats (card_code, strength, defense, agility, wisdom, energy, luck) VALUES (?, ?, ?, ?, ?, ?, ?)';
      const valuesStats = [cardCode, strength, defense, agility, wisdom, energy, luck];

      // Insert into card_inventory
      connection.query(queryInventory, valuesInventory, (err, results) => {
          if (err) {
              console.error('Error adding card to database:', err.message);
              if (callback) callback(err); // Pass the error to the callback
              return; // Exit if there's an error
          }

          console.log('Card added to database:', results);

          // Insert into card_stats
          connection.query(queryStats, valuesStats, (statsErr) => {
              if (statsErr) {
                  console.error('Error adding stats to database:', statsErr.message);
                  if (callback) callback(statsErr); // Pass the error to the callback
                  return; // Exit if there's an error
              }
              if (callback) callback(null, 'Card and stats added successfully!'); // Success message
          });
      });
  });
}


// Function to delete old codes from the database
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

// Function to generate a unique code
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

// Function to check if a card code is valid
function isValidCardCode(cardCode) {
  // Check if the card code consists of letters and digits and has the appropriate length
  const regex = /^[a-zA-Z0-9]{3,7}$/;
  return regex.test(cardCode);
}

// Function to get a card from the database based on the card code
async function getCardFromDatabase(cardCode, userId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM card_inventory WHERE user_id = ? AND card_code = ?`;
    connection.query(query, [userId, cardCode], (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(results[0]); // Return the first matching record (if exists)
      }
    });
  });
}

// Function to extract card codes from an embed
function extractCardCodesFromEmbed(embed) {
  const description = embed.description;
  const regex = /Card Code: (\w+)/g; // Assume card codes have the format "Card Code: XXXXXX"
  let match;
  const cardCodes = [];

  while ((match = regex.exec(description)) !== null) {
    cardCodes.push(match[1]);
  }

  return cardCodes;
}

// Function to switch card ownership
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

// Function to switch ownership for multiple cards
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


// Function to check if a user exists in the database
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

// Function to generate an embed containing provided items
function generateProvideItemsEmbed() {
  // Formatting card codes for both players
  const player1CodesFormatted = player1CardCodes.map(code => `${code}`).join('\n');
  const player2CodesFormatted = player2CardCodes.map(code => `${code}`).join('\n');

  // Creating embed content with card codes for both players
  const embedContent = `${player1CodesFormatted}\n\n${player2CodesFormatted}`;

  // Creating a new embed with the appropriate content
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Provide Items')
    .setDescription(embedContent);

  return embed;
}

// Function to load the latest prints from the database
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


// Function to load existing prints from the database
const loadExistingPrintsFromDatabase = async () => {
  try {
    const latestPrints = await loadLatestPrintsFromDatabase();
    existingPrints = { ...latestPrints };
    //console.log('Existing prints loaded from the latest prints:', existingPrints);

    // Load counters from the database
    const loadCountsQuery = 'SELECT card_name, latest_print AS latest FROM card_info';
    const counts = await query(loadCountsQuery);
    counts.forEach((row) => {
      cardCounts[row.card_name] = row.latest;
      //console.log(row.card_name)
    });

    //console.log('Card counts loaded from the database:', cardCounts);
  } catch (error) {
    console.error('Error loading existing prints from the latest prints:', error.message);
  }
};

// Function to update the latest print in the database
const updateLatestPrintInDatabase = async (cardName, latestPrint) => {
  try {
    //console.log(`Attempting to update latest print in the database for ${cardName} to ${latestPrint}`);

    // Check if latestPrint is a number or string
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

//////////NEW
//const imageUrls1 = './imageUrls.json';
const loadAndInsertCardData = async (filePath) => {
  try {
    
    const data = await readFileAsync(filePath, 'utf-8');
    const jsonData = JSON.parse(data);

    
    // Przygotowanie zapytania do dodania danych
    //const insertQuery = 'INSERT INTO user_data (base_element) VALUES (?)';

    for (const item of jsonData) {
      if (item.baseElement) {
        //await connection.execute(insertQuery, [item.baseElement]);
        return new Promise((resolve, reject) => {
          const query = 'INSERT INTO card_info (base_element) VALUES (?)';
          connection.query(query, [item.baseElement], (err, results) => {
            if (err) {
              reject(err);
            } else {
              resolve(results);
            }
          });
        });
      }
    }

      return new Promise((resolve, reject) => {
        const query = 'INSERT INTO card_info (base_element) VALUES (?)';
        connection.query(query, [userId, itemType, amount], (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        });
      });
  } catch (error) {
    console.error('Error with user_data db:', error.message);
  }
};

// Function to process JSON data, check for existing cards, and insert new ones
function processAndAddCardData(filePath) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading JSON file:', err.message);
      return;
    }

    const cards = JSON.parse(data);

    cards.forEach(card => {
      const { name, baseElement, description = null } = card;
      const latestPrint = 0; // Assuming latestPrint is always 0 as per your example

      // Check if the card already exists
      const checkQuery = 'SELECT COUNT(*) AS count FROM card_info WHERE card_name = ? AND latest_print = ? AND base_element = ?';
      connection.query(checkQuery, [name, latestPrint, baseElement], (err, results) => {
        if (err) {
          console.error('Error checking if card exists:', err.message);
          return;
        }

        if (results[0].count === 0) {
          // Card does not exist, so insert it
          const insertQuery = 'INSERT INTO card_info (card_name, latest_print, base_element) VALUES (?, ?, ?)';
          const values = [name, latestPrint, baseElement];

          connection.query(insertQuery, values, (err, results) => {
            if (err) {
              //console.error('Error adding card info to database:', err.message);
            } else {
              console.log('Card info added to database:', results);
            }
          });
        } else {
          console.log('Card already exists in database:', name);
        }
      });
    });
  });
}


function addCardInfoToDatabase(cardName, latestPrint) {
  const insertQuery = `
    INSERT INTO card_info (card_name, latest_print)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE latest_print = VALUES(latest_print);
  `;

  connection.query(insertQuery, [cardName, latestPrint], (err, results) => {
    if (err) {
      //console.error('Error adding card info to database:', err.message);
      console.log('All cards prints updated!')
    } else {
      console.log('Card info added or updated in database:', results);
    }
  });
}

// Function to check if message content starts with a command or its alias and return the matched alias
function getMatchingAlias(content, command) {
  content = content.toLowerCase();
  command = command.toLowerCase();
  if (content.startsWith(command)) return command;
  if (aliases[command]) {
    for (let alias of aliases[command]) {
      if (content.startsWith(alias.toLowerCase())) {
        return alias.toLowerCase();
      }
    }
  }
  return null;
}

// Function to save user color
async function saveUserColor(userId, color) {
  const query = `INSERT INTO user_colors (user_id, color) VALUES (?, ?)`;

  connection.query(query, [userId, color], function(error, results, fields) {
      if (error) {
          console.error('Error saving user color:', error);
          return;
      }

      console.log('User color saved successfully.');
  });
}




// Function to check if message content matches a command or its alias
function matchesCommand(content, command) {
  content = content.toLowerCase();
  command = command.toLowerCase();
  return content === command || (aliases[command] && aliases[command].map(alias => alias.toLowerCase()).includes(content));
}

// Function to check if message content starts with a command or its alias (for prefix-based commands)
function startsWithCommand(content, command) {
  content = content.toLowerCase();
  command = command.toLowerCase();
  return content.startsWith(command) || (aliases[command] && aliases[command].map(alias => alias.toLowerCase()).some(alias => content.startsWith(alias)));
}

// Function to start the bot
function startBot() {
  client.login(process.env.TOKEN);
}

// Function to initialize the bot
async function initializeBot() {

  //loadAndInsertCardData(imageUrlsPath) - >     broken
  /* const loadAndInsertCardData = async (filePath) => {
  try {
    
    const data = await readFileAsync(filePath, 'utf-8');
    const jsonData = JSON.parse(data);

    
    // Przygotowanie zapytania do dodania danych
    const insertQuery = 'INSERT INTO user_data (card_name, description) VALUES (?, ?)';

    for (const item of jsonData) {
      if (item.name && item.description) {
        await connection.execute(insertQuery, [item.name, item.description]);
      }
    }
  } catch (error) {
    console.error('Error with user_data db:', error.message);
  }
};*/
  //processAndAddCardData('./imageUrls.json') // working
  // Load latest prints from the database
  await loadLatestPrintsFromDatabase();

  // Load existing prints from the database
  await loadExistingPrintsFromDatabase();

  //loadAndInsertCardData(imageUrlsPath)
  startBot();
}

// Initialize the bot
initializeBot();
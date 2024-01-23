// Steps to Run:
// 0. If neccesary, check out this code and then follow the Discord.js tutorial make and add a bot to your server
// 1. Update the UPPERCASE_CONSTANT_VARIABLES below and in secrets.js 
//     - Search discord for "imgur.com" to find any new imgur links that need to be added, and add them to the list below.
// 2. Run with `node <filename>` in actual Terminal window not VSCode
// 3. Open them output file to see your results!

const THEMES_FILE_NAME = "themes.txt";

const SHOULD_SCRAPE_DISCORD_MESSAGES = true;
const GUILD_ID = "1132366246223040642";
const IGNORE_CHANNEL_CATEGORIES = new Set([
    "1142866269062824068", // STAFF
]);
// Note, there's only 20ish channels to read, so if it looks like the bot
// is stalled, then its probably not and it just ran out of channels to read
const IGNORE_CHANNELS = new Set([
    "1135223324117573702", // #general
]);

const SHOULD_SCRAPE_IMGUR_LINKS = true;
// Remove all url params like the ?abc=def&wx=yz stuff
const ALL_IMGUR_LINKS_TO_SCRAPE = [
    "https://imgur.com/a/TXnFAzK", // Harry
    "https://imgur.com/gallery/bFUgVtz", // Skr
    "https://imgur.com/a/rjVAMbb", // Reaper
    //"https://imgur.com/gallery/dYEMjzP", // Mr.Hacker - no longer works
    "https://imgur.com/gallery/sl44gV0", // Harry 2
    "https://imgur.com/a/9GdfuxI", // Reaper 2
    "https://imgur.com/a/gxFemAk", // Reaper Color Blindness Simulators
];

const REPLACEMENTS = {
    '<#1136268338977308682>': '#1c' // channel previously known as #1c messed up colors starting with #1c
}

// ========================================

const { DISCORD_BOT_TOKEN: token, IMGUR_CLIENT_ID } = require('./secrets');
const fetchAll = require('discord-fetch-all');
const fs = require('fs');
const { Client, Intents } = require("discord.js");
const fetch = require('node-fetch');

// Returns set of the themes already saved in the themes file
// Themes file is a text file where each line contains a Tiger Theme string
function loadSeenThemes() {
    // Create json file if it doesn't exist
    if (!fs.existsSync(THEMES_FILE_NAME)) {
        fs.writeFileSync(THEMES_FILE_NAME, "")
    }

    const existingThemes = fs.readFileSync(THEMES_FILE_NAME, 'utf8').split('\n');
    return new Set(existingThemes);
}

// Returns array of channels
function getChannels(guild) {
    // this is a Map
    let channels = guild.channels.cache;
    // Convert to array
    channels = [...channels.values()];
    // Get all text channels in guild - https://stackoverflow.com/a/71135097
    channels = channels.filter((c) => c.type === "text");
    // remove ignorable channels
    channels = channels.filter(c => 
        !IGNORE_CHANNELS.has(c.id) 
        && !IGNORE_CHANNEL_CATEGORIES.has(c?.parent.id)); // .parentId doesn't work idk why
    console.log(channels.map(c => c.name));
    return channels;
}

// returns theme string if present, null otherwise
function extractFirstFoundTigerThemeFromText(text) {
    const [ themeStarter, themeEnder ] = [ 'TIGER_JSON{', '}}}' ];

    // only use messages that contain both 'TIGER_JSON{' and '}}}'
    if (!text.includes(themeStarter) || !text.includes(themeEnder)) {
        return null;
    }
    
    // ensure theme ender is after theme starter
    const themeStarterIndex = text.indexOf(themeStarter);
    // DONT USE LASTINDEXOF because there may be multiple themes in 1 message
    const themeEnderIndex = text.indexOf(themeEnder);
    if (themeEnderIndex <= themeStarterIndex) {
        return null;
    }

    // extract the actual theme from the message, then add it to the set
    return text.slice(themeStarterIndex, themeEnderIndex + themeEnder.length);
}

// Generalized function for both channel messages and imgur descriptions
// Returns all matches from texts with 1 or more match in them
// matchFunction must take in 1 string (the text) and return the 1st found match as a string or null if there's none
function extractAllMatchesFromTexts(texts, seenSet, matchFunction) {
    const unseenSet = new Set();
    
    for (let text of texts) {
        // Use a while loop because there may be multiple themes per message
        while (true) {
            const firstFoundMatch = matchFunction(text);

            // If no valid matches found in msg, 
            // break out of loop to continue to next msg
            if (!firstFoundMatch) break;

            // If valid match and it wasn't already scraped, then add it to unseenThemes
            if (firstFoundMatch && !seenSet.has(firstFoundMatch)) {
                console.log(firstFoundMatch)
                unseenSet.add(firstFoundMatch);
            }

            // remove the extracted theme from the text to see if there's more themes within message
            // .replace only replaces 1st found instance of theme
            text = text.replace(firstFoundMatch, "");
        }
    }

    return unseenSet;
}

// Also do replacements
function appendThemesToFile(themes) {
    let allThemesStr = "";
    for (const theme of themes) {
        allThemesStr += (theme + "\n");
    }
    
    // Do replacements
    for (const older in REPLACEMENTS) {
        const newer = REPLACEMENTS[older];
        allThemesStr = allThemesStr.replaceAll(older, newer);
    }

    fs.appendFileSync(THEMES_FILE_NAME, allThemesStr);
}

// Not worth trying to extract all imgur links automatically because their url's vary a lot
// There's only a handful of imgur links in the server, so its easier to maintain a manual list
// Updates and returns seenThemes

// SWITCH TO USING IMGUR API BECAUSE SOME ALBUMS HAVE LOAD MORE BTN AND ALL THAT
// API WOULD BE WAY EASIER, use nodejs unirest - https://apidocs.imgur.com/#7dde894b-a967-4419-9be2-082fbf379109
async function scrapeAllImgurThemes(seenThemes) {
    console.log('Scraping Imgur sites!');

    const failedScrapes = [];
    let allImgDescriptions = new Set();

    for (const url of ALL_IMGUR_LINKS_TO_SCRAPE) {
        try {
            console.log("Scraping " + url);
            // Get the part after the last '/'
            const albumHash = url.split('/').at(-1);

            const res = await fetch(`https://api.imgur.com/3/album/${albumHash}/images`, {
                headers: {
                    'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`,
                },
            })
            const json = await res.json();
            const imgDescriptions = json.data.map(img => img.description);
            allImgDescriptions = new Set([...allImgDescriptions, ...imgDescriptions]);
        } catch {
            failedScrapes.push(url);
        }
    }

    if (failedScrapes.length > 0) {
        console.error("Scraping failed for the following url's:");
        for (const failedUrl of failedScrapes) {
            console.error(failedUrl);
        }
    }

    const unseenThemes = extractAllMatchesFromTexts(allImgDescriptions, seenThemes, extractFirstFoundTigerThemeFromText);
    appendThemesToFile(unseenThemes);
    seenThemes = new Set([...seenThemes, ...unseenThemes]);
    return seenThemes;
}

// updates and returns seenThemes
async function scrapeAllThemesInServer(guild, seenThemes) {
    const channels = getChannels(guild);
   
    // For each channel, get all messages and extract all themes
    // then save themes to a giant txt file, where each line is a theme
    for (const ch of channels) {
        console.log('Reading channel ' + ch.name);

        // Only get messages sent by non-bot users
        const allMessages = await fetchAll.messages(ch, {userOnly: true});
        // need to enable Message Content on bot's discord settings page for this to work
        const allMessagesTexts = allMessages.map(msg => msg.content);

         // After reading a channel, append its unseen themes to the file and seenThemes
        unseenThemes = extractAllMatchesFromTexts(allMessagesTexts, seenThemes, extractFirstFoundTigerThemeFromText);
        appendThemesToFile(unseenThemes);
        seenThemes = new Set([...seenThemes, ...unseenThemes]);
    }
    return seenThemes;
}

function main() {
    const client = new Client({
        intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
    });

    client.on("ready", async () => {
        console.log("I am ready! Scraping themes now!");
        let seenThemes = loadSeenThemes();

        // Scrape themes in discord messages
        if (SHOULD_SCRAPE_DISCORD_MESSAGES) {
            const guild = await client.guilds.fetch(GUILD_ID);
            seenThemes = await scrapeAllThemesInServer(guild, seenThemes);
        }

        // Scrape themes in Imgurs
        if (SHOULD_SCRAPE_IMGUR_LINKS) {
            seenThemes = await scrapeAllImgurThemes(seenThemes);
        }

        console.log("Scraping done! Goodbye!");
        client.destroy();
    });

    client.login(token);
}

main();
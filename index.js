// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('avatar').setDescription('Show Roblox avatar headshot').addStringOption(opt => opt.setName('user').setDescription('Roblox username or user id').setRequired(true)),
  new SlashCommandBuilder().setName('user').setDescription('Mention a Discord user and show Roblox avatar').addUserOption(opt => opt.setName('discord').setDescription('Discord user to mention').setRequired(true)).addStringOption(opt => opt.setName('roblox').setDescription('Roblox username or id').setRequired(true)),
  new SlashCommandBuilder().setName('donotax').setDescription('Donate amount (40% tax)').addNumberOption(opt => opt.setName('amount').setDescription('Amount (number)').setRequired(true)),
  new SlashCommandBuilder().setName('gamepasstax').setDescription('Gamepass donation (30% tax)').addNumberOption(opt => opt.setName('amount').setDescription('Amount (number)').setRequired(true)),
  new SlashCommandBuilder().setName('userinfo').setDescription('Detailed Roblox user info embed').addStringOption(opt => opt.setName('user').setDescription('Roblox username or user id').setRequired(true)),
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Registered guild commands.');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Registered global commands (may take up to an hour to appear).');
    }
  } catch (err) {
    console.error('Error registering commands', err);
  }
}

// ---------- Roblox helper functions ----------
async function usernameToId(name) {
  // if numeric already, return as int
  if (/^\d+$/.test(name)) return parseInt(name, 10);
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [name] })
    .catch(() => null);
  if (!res || !res.data || !res.data.data || res.data.data.length === 0) return null;
  return res.data.data[0].id;
}

async function getUserById(id) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${id}`).catch(() => null);
  return res ? res.data : null;
}

async function getHeadshotUrl(id, size = '420x420') {
  const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=${size}&format=Png&isCircular=false`)
    .catch(() => null);
  if (!res || !res.data || !res.data.data || res.data.data.length === 0) return null;
  return res.data.data[0].imageUrl;
}

async function getFriendsCount(id) {
  const res = await axios.get(`https://friends.roblox.com/v1/users/${id}/friends/count`).catch(() => null);
  return res && res.data ? res.data.count ?? null : null;
}

async function getFollowersCount(id) {
  const res = await axios.get(`https://friends.roblox.com/v1/users/${id}/followers/count`).catch(() => null);
  return res && res.data ? res.data.count ?? null : null;
}

async function getFollowingsCount(id) {
  const res = await axios.get(`https://friends.roblox.com/v1/users/${id}/followings/count`).catch(() => null);
  return res && res.data ? res.data.count ?? null : null;
}

async function getPresence(id) {
  // presence API: POST with userIds array
  const res = await axios.post('https://presence.roblox.com/v1/presence/users', { userIds: [id] }).catch(() => null);
  if (!res || !res.data || !res.data.userPresences || res.data.userPresences.length === 0) return null;
  return res.data.userPresences[0]; // presenceType etc
}

async function getBadges(id) {
  const res = await axios.get(`https://badges.roblox.com/v1/users/${id}/badges?limit=100`).catch(() => null);
  return res && res.data && res.data.data ? res.data.data : [];
}

async function getProfileInfo(id) {
  // user-profile endpoints (description, lastOnline, etc) - users endpoint & profile endpoints
  const res = await axios.get(`https://users.roblox.com/v1/users/${id}`).catch(() => null);
  const profile = res && res.data ? res.data : null;
  // description from user-profiles:
  const descRes = await axios.get(`https://users.roblox.com/v1/users/${id}/profile`).catch(() => null);
  const profileData = descRes && descRes.data ? descRes.data : null;
  return { profile, profileData };
}
// ---------- end roblox helpers ----------

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.User]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

  try {
    if (name === 'avatar') {
      await interaction.deferReply();
      const userInput = interaction.options.getString('user', true);
      const id = await usernameToId(userInput);
      if (!id) return interaction.editReply('Could not find that Roblox user.');
      const url = await getHeadshotUrl(id);
      if (!url) return interaction.editReply('Could not fetch avatar headshot.');
      return interaction.editReply({ content: `Roblox headshot for ${userInput} (id: ${id})`, files: [url] });
    }

    if (name === 'user') {
      await interaction.deferReply();
      const discordUser = interaction.options.getUser('discord', true);
      const robloxInput = interaction.options.getString('roblox', true);
      const id = await usernameToId(robloxInput);
      if (!id) return interaction.editReply('Could not find that Roblox user.');
      const url = await getHeadshotUrl(id);
      const mention = `<@${discordUser.id}>`;
      if (url) {
        return interaction.editReply({ content: `${mention}`, files: [url] });
      } else {
        return interaction.editReply(`${mention}\n(avatar not found)`);
      }
    }

    if (name === 'donotax' || name === 'gamepasstax') {
      const amount = interaction.options.getNumber('amount', true);
      const tax = name === 'donotax' ? 0.40 : 0.30;
      const net = amount * (1 - tax);
      // format to 2 decimals but show ints nicely
      const fmt = (n) => (Number.isInteger(n) ? n : Number(n.toFixed(2)));
      return interaction.reply({
        content: `${name === 'donotax' ? 'Donate (donation tax 40%)' : 'Gamepass donation (tax 30%)'}\nOriginal: ${fmt(amount)} → After ${tax * 100}% tax: ${fmt(net)}`
      });
    }

    if (name === 'userinfo') {
      await interaction.deferReply();
      const userInput = interaction.options.getString('user', true);
      const id = await usernameToId(userInput);
      if (!id) return interaction.editReply('Could not find that Roblox user.');

      // fetch several Roblox endpoints in parallel
      const [userInfo, headshot, friends, followers, followings, presence, badges, profileInfo] = await Promise.all([
        getUserById(id),
        getHeadshotUrl(id),
        getFriendsCount(id),
        getFollowersCount(id),
        getFollowingsCount(id),
        getPresence(id),
        getBadges(id),
        getProfileInfo(id)
      ]);

      if (!userInfo) return interaction.editReply('Could not fetch user info.');

      // Build embed
      const displayName = userInfo.displayName || userInfo.username;
      const username = userInfo.name || userInfo.username || userInput;
      const profileUrl = `https://roblox.com/users/${id}/profile`;
      const rolimonsRap = `https://www.rolimons.com/player/${id}`;
      const rolimonsValue = `https://www.rolimons.com/player/${id}`; // same link, masked text will differ

      const friendsStr = (friends === null ? 'N/A' : friends);
      const followersStr = (followers === null ? 'N/A' : followers);
      const followingStr = (followings === null ? 'N/A' : followings);
      const presenceType = presence ? presence.presenceType : null; // 0 offline, 1 online, 2 in-game, etc

      // account created - userInfo.created with iso
      let created = 'Unknown';
      if (userInfo && userInfo.created) {
        const d = new Date(userInfo.created);
        created = d.toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      // badges list - show up to 10 badges by name
      const badgeList = (badges && badges.length) ? badges.slice(0, 10).map(b => b.name).join(', ') : 'None';

      // description
      const description = (profileInfo && profileInfo.profileData && profileInfo.profileData.blurb) ? profileInfo.profileData.blurb : (profileInfo && profileInfo.profile && profileInfo.profile.description) ? profileInfo.profile.description : 'No description';

      // inventory privacy: best-effort: profileData may include 'isInventoryPrivate' or similar (Roblox sometimes hides)
      const inventoryPrivacy = (profileInfo && profileInfo.profileData && typeof profileInfo.profileData.isInventoryPrivate !== 'undefined') ? (profileInfo.profileData.isInventoryPrivate ? 'Private' : 'Public') : 'Unknown';

      // verified: Roblox API sometimes includes hasVerifiedBadge or similar; fallback unknown
      const verified = (userInfo && userInfo.hasVerifiedBadge) ? 'Yes' : 'No';

      // RAP/value: these aren't public via Roblox APIs; we'll link to rolimons and show "Check" if unknown.
      const rapMaskedText = `[Check RAP](${rolimonsRap})`;
      const valueMaskedText = `[Check Value](${rolimonsValue})`;

      // presence display
      let presenceText = 'Unknown';
      if (presenceType === 0) presenceText = 'Offline';
      else if (presenceType === 1) presenceText = 'Online';
      else if (presenceType === 2) presenceText = 'In game';
      else presenceText = `Type ${presenceType}`;

      // Discord avatar + username on top (use interaction.user)
      const discordAvatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 512 });
      const discordName = `${interaction.user.username}#${interaction.user.discriminator}`;

      const embed = new EmbedBuilder()
        .setTitle(`${displayName} (${username})`)
        .setURL(profileUrl)
        .setThumbnail(headshot || undefined)
        .setAuthor({ name: `${discordName}`, iconURL: discordAvatarUrl })
        .addFields(
          { name: 'Friends | Followers | Following', value: `${friendsStr} | ${followersStr} | ${followingStr}`, inline: false },
          { name: 'User id', value: `${id}`, inline: true },
          { name: 'Verified', value: verified, inline: true },
          { name: 'Inventory privacy', value: inventoryPrivacy, inline: true },
          { name: 'RAP', value: rapMaskedText, inline: true },
          { name: 'Estimated value', value: valueMaskedText, inline: true },
          { name: 'Account created', value: created, inline: false },
          { name: 'Badges', value: badgeList || 'None', inline: false },
          { name: 'Description', value: description || 'None', inline: false },
        )
        .setFooter({ text: `${presenceText} | roblox.com` });

      return interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('Command error:', err);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply('Something went wrong while processing your request.');
    } else {
      interaction.reply('Something went wrong while processing your request.');
    }
  }
});

(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// IDs
const STAFF_ROLE_ID = "1480275688161546423";
const LOG_CHANNEL_ID = "1480282906374049954";
const PANEL_CHANNEL_ID = "1470125297318760500";

const CATEGORIES = {
  help: "1480275198946316439",
  partner: "1480275263828000909",
  verify: "1480275326243311911"
};

let ticketCounter = 1;
const openTickets = new Map(); // userId -> channelId

// ---------- PANEL ----------

function createTicketEmbed() {
  return new EmbedBuilder()
    .setTitle("Casio Tickets")
    .setColor("#010101")
    .setDescription("Please select the reason for opening a ticket.")
    .setImage("https://media.discordapp.net/attachments/1422258959548551230/1480216888473813128/IMG_2877.gif");
}

function createTicketMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_menu")
      .setPlaceholder("Choose a ticket type")
      .addOptions([
        {
          label: "Help",
          description: "Get assistance from staff",
          value: "help",
          emoji: "<a:826348blackbat:1452868339029512352>"
        },
        {
          label: "Partnership",
          description: "Request a partnership",
          value: "partner",
          emoji: "<a:826348blackbat:1452868339029512352>"
        },
        {
          label: "Verify",
          description: "Verify your identity",
          value: "verify",
          emoji: "<a:826348blackbat:1452868339029512352>"
        }
      ])
  );
}

function createTicketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel("Claim")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_delete")
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger)
  );
}

// ---------- READY ----------

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ---------- SEND PANEL COMMAND ----------

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.content.toLowerCase() !== ".ticketpanel") return;

  const channel = await client.channels.fetch(PANEL_CHANNEL_ID);

  await channel.send({
    embeds: [createTicketEmbed()],
    components: [createTicketMenu()]
  });

  msg.reply("Ticket panel sent.");
});

// ---------- INTERACTIONS ----------

client.on("interactionCreate", async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== "ticket_menu") return;
    return handleTicketSelect(interaction);
  }

  if (interaction.isButton()) {
    if (!interaction.channel) return;
    if (interaction.customId === "ticket_claim") return handleTicketClaim(interaction);
    if (interaction.customId === "ticket_close") return handleTicketClose(interaction);
    if (interaction.customId === "ticket_delete") return handleTicketDelete(interaction);
  }
});

// ---------- HANDLERS ----------

async function handleTicketSelect(interaction) {
  const type = interaction.values[0];
  const user = interaction.user;

  if (openTickets.has(user.id)) {
    const existingChannelId = openTickets.get(user.id);
    const existingChannel = interaction.guild.channels.cache.get(existingChannelId);
    return interaction.reply({
      content: existingChannel
        ? `You already have an open ticket: ${existingChannel}`
        : "You already have an open ticket.",
      ephemeral: true
    });
  }

  const categoryID = CATEGORIES[type];
  if (!categoryID) {
    return interaction.reply({
      content: "This ticket type is not configured.",
      ephemeral: true
    });
  }

  const ticketNumber = ticketCounter++;
  const channelName = `ticket-${ticketNumber}-${user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, "");

  const ticketChannel = await interaction.guild.channels.create({
    name: channelName,
    type: 0,
    parent: categoryID,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: ["ViewChannel"]
      },
      {
        id: user.id,
        allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"]
      },
      {
        id: STAFF_ROLE_ID,
        allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"]
      }
    ]
  });

  openTickets.set(user.id, ticketChannel.id);

  await interaction.reply({
    content: `Your ticket has been created: ${ticketChannel}`,
    ephemeral: true
  });

  const ticketEmbed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticketNumber}`)
    .setColor("#010101")
    .setDescription(
      `Welcome <@${user.id}>!\nA staff member will assist you shortly.\n\n**Ticket Type:** \`${type}\``
    );

  await ticketChannel.send({
    content: `<@${user.id}> <@&${STAFF_ROLE_ID}>`,
    embeds: [ticketEmbed],
    components: [createTicketButtons()]
  });

  await logEvent(interaction.guild, {
    title: `Ticket #${ticketNumber} created`,
    description: `Type: \`${type}\`\nUser: <@${user.id}>\nChannel: ${ticketChannel}`
  });
}

async function handleTicketClaim(interaction) {
  if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "Only staff can claim tickets.", ephemeral: true });
  }

  await interaction.reply({
    content: `Ticket claimed by <@${interaction.user.id}>.`,
    ephemeral: false
  });

  await logEvent(interaction.guild, {
    title: "Ticket claimed",
    description: `Staff: <@${interaction.user.id}>\nChannel: ${interaction.channel}`
  });
}

async function handleTicketClose(interaction) {
  if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "Only staff can close tickets.", ephemeral: true });
  }

  const channel = interaction.channel;
  const userId = getTicketOwnerFromChannel(channel);

  await interaction.reply({ content: "Ticket closed.", ephemeral: true });

  await logEvent(interaction.guild, {
    title: "Ticket closed",
    description: `Channel: ${channel}\nClosed by: <@${interaction.user.id}>`
  });

  if (userId && openTickets.has(userId)) openTickets.delete(userId);

  await channel.send("This ticket will be deleted in 10 seconds.");
  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 10000);
}

async function handleTicketDelete(interaction) {
  if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "Only staff can delete tickets.", ephemeral: true });
  }

  const channel = interaction.channel;
  const userId = getTicketOwnerFromChannel(channel);

  await interaction.reply({ content: "Deleting ticket...", ephemeral: true });

  await logEvent(interaction.guild, {
    title: "Ticket deleted",
    description: `Channel: ${channel}\nDeleted by: <@${interaction.user.id}>`
  });

  if (userId && openTickets.has(userId)) openTickets.delete(userId);

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 2000);
}

// ---------- HELPERS ----------

function getTicketOwnerFromChannel(channel) {
  const match = channel.name.match(/ticket-\d+-(.+)/);
  if (!match) return null;

  const usernamePart = match[1];
  const member = channel.guild.members.cache.find((m) => m.user.username.toLowerCase() === usernamePart);
  return member ? member.id : null;
}

async function logEvent(guild, { title, description }) {
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor("#010101")
    .setDescription(description)
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });
}

// ---------- LOGIN ----------

client.login(process.env.DISCORD_TOKEN);

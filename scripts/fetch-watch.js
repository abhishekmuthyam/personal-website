const fs = require("fs/promises");
const path = require("path");

const channels = [
  { name: "freeCodeCamp", topic: "coding", topicLabel: "Coding", id: "UC8butISFwT-Wl7EV0hUK0BQ" },
  { name: "Fireship", topic: "coding", topicLabel: "Coding", id: "UCsBjURrPoezykLs9EqgamOA" },
  { name: "Computerphile", topic: "coding", topicLabel: "Coding", id: "UC9-y-6csu5WGm29I7JiwpnA" },
  { name: "Veritasium", topic: "science", topicLabel: "Science", id: "UCHnyfMqiRRG1u-2MsSQLbXA" },
  { name: "Kurzgesagt", topic: "science", topicLabel: "Science", id: "UCsXVk37bltHxD1rDPwtNM8Q" },
  { name: "3Blue1Brown", topic: "learn", topicLabel: "Learn", id: "UCYO_jab_esuFRV4b17AJtAw" },
  { name: "CrashCourse", topic: "learn", topicLabel: "Learn", id: "UCX6b17PVsYBQ0ip5gyeme-Q" },
  { name: "TED", topic: "learn", topicLabel: "Learn", id: "UCAuUUnT6oDeKwE6v1NGQxug" },
  { name: "Marques Brownlee", topic: "tech", topicLabel: "Tech", id: "UCBJycsmduvYEL83R_U4JriQ" },
  { name: "Two Minute Papers", topic: "ai", topicLabel: "AI", id: "UCbfYPyITQ-7l4upoX8nvctg" },
  { name: "Lex Fridman", topic: "ai", topicLabel: "AI", id: "UCSHZKyawb77ixDdsGog4iWA" },
  { name: "DeepLearningAI", topic: "ai", topicLabel: "AI", id: "UCcIXc5mJsHVYTZR1maL5l9w" },
  { name: "NetworkChuck", topic: "tech", topicLabel: "Tech", id: "UC9x0AN7BWHpCDHSm9NiJFJQ" }
];

function pick(xml, tag) {
  const match = xml.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">"));
  return match ? match[1].trim() : "";
}

function decode(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchChannel(channel) {
  const url = "https://www.youtube.com/feeds/videos.xml?channel_id=" + channel.id;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (personal-site watch feed)" } });
  if (!res.ok) {
    throw new Error("HTTP " + res.status);
  }
  const xml = await res.text();
  const entries = xml.split("<entry>").slice(1);

  return entries.slice(0, 10).map(entry => {
    const videoId = pick(entry, "yt:videoId");
    return {
      videoId,
      title: decode(pick(entry, "title")),
      channel: channel.name,
      topic: channel.topic,
      topicLabel: channel.topicLabel,
      published: pick(entry, "published"),
      thumbnail: "https://i.ytimg.com/vi/" + videoId + "/mqdefault.jpg"
    };
  }).filter(v => v.videoId && v.title);
}

async function main() {
  const results = await Promise.allSettled(channels.map(fetchChannel));
  const videos = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      videos.push(...result.value);
    } else {
      console.error("Failed: " + channels[i].name + " — " + result.reason.message);
    }
  });

  if (videos.length === 0) {
    throw new Error("No videos fetched; refusing to overwrite data file.");
  }

  videos.sort((a, b) => (a.published < b.published ? 1 : -1));

  const out = {
    updatedAt: new Date().toISOString(),
    videos
  };

  const outPath = path.join(__dirname, "..", "watch", "watch-data.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote " + videos.length + " videos from " + results.filter(r => r.status === "fulfilled").length + "/" + channels.length + " channels.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

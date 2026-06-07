const fs = require("fs/promises");
const path = require("path");

const sources = [
  {
    name: "Inside Java",
    topic: "java",
    topicLabel: "Java",
    url: "https://inside.java/feed.xml"
  },
  {
    name: "Spring Blog",
    topic: "java",
    topicLabel: "Java",
    url: "https://spring.io/blog.atom"
  },
  {
    name: "AWS What's New",
    topic: "cloud",
    topicLabel: "Cloud",
    url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/"
  },
  {
    name: "AWS News Blog",
    topic: "cloud",
    topicLabel: "Cloud",
    url: "https://aws.amazon.com/blogs/aws/feed/"
  },
  {
    name: "OpenAI News",
    topic: "ai",
    topicLabel: "AI",
    url: "https://openai.com/news/rss.xml"
  },
  {
    name: "Hugging Face Blog",
    topic: "ai",
    topicLabel: "AI",
    url: "https://huggingface.co/blog/feed.xml"
  },
  {
    name: "GitHub Blog",
    topic: "devtools",
    topicLabel: "Dev Tools",
    url: "https://github.blog/feed/"
  },
  {
    name: "Hacker News",
    topic: "devtools",
    topicLabel: "Dev Tools",
    url: "https://news.ycombinator.com/rss"
  }
];

const outputPath = path.join(__dirname, "..", "news", "news-data.json");

async function main() {
  const results = await Promise.all(sources.map(fetchSource));
  const items = results
    .flatMap(result => result.items)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 50);

  const data = {
    updatedAt: new Date().toISOString(),
    sources: results.map(({ items, ...source }) => source),
    items
  };

  await fs.writeFile(outputPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Wrote ${items.length} news items to ${outputPath}`);
}

async function fetchSource(source) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "abhishekmuthyam.com news updater"
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const items = parseFeed(xml, source).slice(0, 8);
    return {
      name: source.name,
      topic: source.topic,
      ok: true,
      count: items.length,
      items
    };
  } catch (error) {
    console.log(`${source.name} failed: ${error.message}`);
    return {
      name: source.name,
      topic: source.topic,
      ok: false,
      count: 0,
      error: error.message,
      items: []
    };
  }
}

function parseFeed(xml, source) {
  const entries = getBlocks(xml, "item").length ? getBlocks(xml, "item") : getBlocks(xml, "entry");

  return entries
    .map(entry => {
      const title = cleanText(getTag(entry, "title"));
      const link = getLink(entry);
      const summary = cleanText(getTag(entry, "description") || getTag(entry, "summary") || getTag(entry, "content"));
      const publishedAt = cleanText(getTag(entry, "pubDate") || getTag(entry, "published") || getTag(entry, "updated"));

      return {
        title,
        link,
        summary: truncate(summary, 220),
        source: source.name,
        topic: source.topic,
        topicLabel: source.topicLabel,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null
      };
    })
    .filter(item => item.title && item.link);
}

function getBlocks(xml, tag) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return Array.from(xml.matchAll(pattern), match => match[1]);
}

function getTag(xml, tag) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(pattern);
  return match ? match[1] : "";
}

function getLink(entry) {
  const atomLink = entry.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (atomLink) {
    return decodeEntities(atomLink[1]);
  }

  return cleanText(getTag(entry, "link"));
}

function cleanText(value) {
  return decodeEntities(String(value || ""))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength - 1).trim() + "...";
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

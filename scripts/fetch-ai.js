const fs = require("fs/promises");
const path = require("path");

const sources = [
  {
    name: "OpenAI",
    topic: "official",
    topicLabel: "Official",
    url: "https://openai.com/news/rss.xml"
  },
  {
    name: "Google AI",
    topic: "official",
    topicLabel: "Official",
    url: "https://blog.google/technology/ai/rss/"
  },
  {
    name: "Hugging Face",
    topic: "research",
    topicLabel: "Research & Models",
    url: "https://huggingface.co/blog/feed.xml"
  },
  {
    name: "MIT Tech Review",
    topic: "research",
    topicLabel: "Research & Models",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed"
  },
  {
    name: "The Verge AI",
    topic: "coverage",
    topicLabel: "AI News",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"
  },
  {
    name: "VentureBeat AI",
    topic: "coverage",
    topicLabel: "AI News",
    url: "https://venturebeat.com/category/ai/feed/"
  },
  {
    name: "Ars Technica AI",
    topic: "coverage",
    topicLabel: "AI News",
    url: "https://arstechnica.com/ai/feed/"
  }
];

const outputPath = path.join(__dirname, "..", "learn", "ai-updates.json");

async function main() {
  const results = await Promise.all(sources.map(fetchSource));
  const items = results
    .flatMap(result => result.items)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 50)
    .map(item => ({
      id: createId(item),
      ...item
    }));

  const data = {
    updatedAt: new Date().toISOString(),
    sources: results.map(({ items, ...source }) => source),
    items
  };

  await fs.writeFile(outputPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Wrote ${items.length} AI updates to ${outputPath}`);
}

async function fetchSource(source) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "abhishekmuthyam.com AI updates fetcher"
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
      const image = getImage(entry);

      return {
        title,
        link,
        summary: truncate(summary, 220),
        image,
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

function getImage(entry) {
  const mediaContent = entry.match(/<media:content\b[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (mediaContent) {
    return decodeEntities(mediaContent[1]);
  }

  const mediaThumbnail = entry.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (mediaThumbnail) {
    return decodeEntities(mediaThumbnail[1]);
  }

  const enclosure = entry.match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*(type=["']image\/[^"']+["'])[^>]*>/i);
  if (enclosure) {
    return decodeEntities(enclosure[1]);
  }

  const htmlImage = entry.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i);
  if (htmlImage) {
    return decodeEntities(htmlImage[1]);
  }

  return "";
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

function createId(item) {
  const base = `${item.source}-${item.title}-${item.publishedAt || item.link}`;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/^-+|-+$/g, "");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

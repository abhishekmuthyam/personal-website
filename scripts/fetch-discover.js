const fs = require("fs/promises");
const path = require("path");

const sources = [
  { name: "Google News Top", category: "general", categoryLabel: "General", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "BBC News", category: "general", categoryLabel: "General", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { name: "Indian Express Politics", category: "politics", categoryLabel: "Politics", url: "https://indianexpress.com/section/political-pulse/feed/" },
  { name: "The Hindu National", category: "india", categoryLabel: "India", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { name: "BBC World", category: "world", categoryLabel: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Google Business", category: "business", categoryLabel: "Business", url: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "Google Entertainment", category: "entertainment", categoryLabel: "Entertainment", url: "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "ESPN", category: "sports", categoryLabel: "Sports", url: "https://www.espn.com/espn/rss/news" },
  { name: "Google Sports", category: "sports", categoryLabel: "Sports", url: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "Google Technology", category: "tech", categoryLabel: "Tech & Science", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "Google Science", category: "tech", categoryLabel: "Tech & Science", url: "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "The Verge", category: "tech", categoryLabel: "Tech & Science", url: "https://www.theverge.com/rss/index.xml" }
];

const outputPath = path.join(__dirname, "..", "discover", "discover-data.json");

async function main() {
  const [feedResults, weather, markets, companies] = await Promise.all([
    Promise.all(sources.map(fetchSource)),
    fetchWeather(),
    fetchMarkets(),
    fetchCompanies()
  ]);

  const rawItems = feedResults
    .flatMap(result => result.items)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 120);
  const items = await enrichWithGoogleSources(clusterItems(rawItems).slice(0, 80));

  const data = {
    updatedAt: new Date().toISOString(),
    sources: feedResults.map(({ items, ...source }) => source),
    weather,
    markets,
    companies,
    items
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Wrote ${items.length} discover items to ${outputPath}`);
}

async function fetchSource(source) {
  try {
    const response = await fetchWithTimeout(source.url, {
      headers: { "User-Agent": "abhishekmuthyam.com discover updater" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const items = parseFeed(xml, source).slice(0, 10);
    return { name: source.name, category: source.category, ok: true, count: items.length, items };
  } catch (error) {
    console.log(`${source.name} failed: ${error.message}`);
    return { name: source.name, category: source.category, ok: false, count: 0, error: error.message, items: [] };
  }
}

async function enrichWithGoogleSources(items) {
  const enriched = [];

  for (const item of items) {
    if (enriched.length < 24) {
      enriched.push(await addGoogleSources(item));
    } else {
      enriched.push(item);
    }
  }

  return enriched.sort((a, b) => {
    const sourceDiff = (b.sourceCount || 1) - (a.sourceCount || 1);
    if (sourceDiff !== 0 && Math.abs(sourceDiff) > 1) return sourceDiff;
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });
}

async function addGoogleSources(item) {
  try {
    const query = item.title.split(/\s+/).slice(0, 10).join(" ");
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": "abhishekmuthyam.com discover updater" }
    });
    if (!response.ok) return item;

    const xml = await response.text();
    const googleItems = parseFeed(xml, {
      name: "Google News Search",
      category: item.category,
      categoryLabel: item.categoryLabel
    }).slice(0, 8);
    const fingerprint = getFingerprint(item.title);

    for (const result of googleItems) {
      if (similarity(fingerprint, getFingerprint(result.title)) < 0.46) continue;
      const duplicate = item.sources.some(source => source.link === result.link || source.name === result.source);
      if (!duplicate) {
        item.sources.push(toSource(result));
      }
      if (!item.image && result.image) item.image = result.image;
    }

    item.sourceCount = item.sources.length;
    item.source = item.sources[0] ? item.sources[0].name : item.source;
    return item;
  } catch (error) {
    return item;
  }
}

async function fetchWeather() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=17.3850&longitude=78.4867&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata&forecast_days=5";
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      location: "Hyderabad",
      temperature: Math.round(data.current.temperature_2m),
      condition: weatherLabel(data.current.weather_code),
      daily: data.daily.time.map((date, index) => ({
        date,
        high: Math.round(data.daily.temperature_2m_max[index]),
        low: Math.round(data.daily.temperature_2m_min[index])
      }))
    };
  } catch (error) {
    return { location: "Hyderabad", error: error.message, daily: [] };
  }
}

async function fetchMarkets() {
  const symbols = [
    { label: "S&P 500", symbol: "^GSPC" },
    { label: "NASDAQ", symbol: "^IXIC" },
    { label: "Bitcoin", symbol: "BTC-USD" },
    { label: "VIX", symbol: "^VIX" }
  ];

  return Promise.all(symbols.map(async item => {
    try {
      const quote = await fetchYahooQuote(item.symbol);
      return { ...item, ...quote };
    } catch (error) {
      return { ...item, error: error.message };
    }
  }));
}

async function fetchCompanies() {
  const symbols = ["NVDA", "MSFT", "AAPL", "GOOGL", "AMZN"];
  return Promise.all(symbols.map(async symbol => {
    try {
      const quote = await fetchYahooQuote(symbol);
      return { symbol, ...quote };
    } catch (error) {
      return { symbol, error: error.message };
    }
  }));
}

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const result = data.chart.result && data.chart.result[0];
  if (!result) throw new Error("No quote");
  const meta = result.meta;
  const price = meta.regularMarketPrice || meta.previousClose || 0;
  const previous = meta.previousClose || price;
  const change = price - previous;
  const changePercent = previous ? (change / previous) * 100 : 0;
  return {
    name: meta.shortName || meta.symbol || symbol,
    price: round(price),
    change: round(change),
    changePercent: round(changePercent)
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeed(xml, source) {
  const entries = getBlocks(xml, "item").length ? getBlocks(xml, "item") : getBlocks(xml, "entry");
  return entries.map(entry => {
    const parsedTitle = parseTitle(cleanText(getTag(entry, "title")), source);
    const link = getLink(entry);
    const summary = cleanText(getTag(entry, "description") || getTag(entry, "summary") || getTag(entry, "content"));
    const publishedAt = cleanText(getTag(entry, "pubDate") || getTag(entry, "published") || getTag(entry, "updated"));
    return {
      title: parsedTitle.title,
      link,
      summary: truncate(summary, 240),
      image: getImage(entry),
      source: parsedTitle.publisher || source.name,
      category: source.category,
      categoryLabel: source.categoryLabel,
      publishedAt: publishedAt ? safeDate(publishedAt) : null
    };
  }).filter(item => item.title && item.link);
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
  if (atomLink) return decodeEntities(atomLink[1]);
  return cleanText(getTag(entry, "link"));
}

function getImage(entry) {
  const patterns = [
    /<media:content\b[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail\b[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<enclosure\b[^>]*url=["']([^"']+)["'][^>]*(type=["']image\/[^"']+["'])[^>]*>/i,
    /<img\b[^>]*src=["']([^"']+)["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = entry.match(pattern);
    if (match) return decodeEntities(match[1]);
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
  if (!value || value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1).trim() + "...";
}

function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function createId(item) {
  return `${item.title}-${item.category}-${item.publishedAt || item.link}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/^-+|-+$/g, "");
}

function parseTitle(title, source) {
  if (!source.name.startsWith("Google ")) {
    return { title, publisher: source.name };
  }

  const parts = title.split(" - ");
  if (parts.length < 2) {
    return { title, publisher: source.name };
  }

  const publisher = parts.pop().trim();
  return {
    title: parts.join(" - ").trim(),
    publisher: publisher || source.name
  };
}

function clusterItems(items) {
  const clusters = [];

  for (const item of items) {
    const fingerprint = getFingerprint(item.title);
    const match = clusters.find(cluster => {
      const score = similarity(cluster.fingerprint, fingerprint);
      return score >= 0.74 || (cluster.category === item.category && score >= 0.52);
    });

    if (match) {
      const hasSource = match.sources.some(source => source.link === item.link);
      if (!hasSource) {
        match.sources.push(toSource(item));
      }
      if (!match.image && item.image) match.image = item.image;
      if (new Date(item.publishedAt || 0) > new Date(match.publishedAt || 0)) {
        match.publishedAt = item.publishedAt;
      }
      if (item.summary && item.summary.length > (match.summary || "").length) {
        match.summary = item.summary;
      }
      continue;
    }

    clusters.push({
      id: createId(item),
      title: item.title,
      link: item.link,
      summary: item.summary,
      image: item.image,
      source: item.source,
      category: item.category,
      categoryLabel: item.categoryLabel,
      publishedAt: item.publishedAt,
      fingerprint,
      sources: [toSource(item)]
    });
  }

  return clusters
    .map(({ fingerprint, ...item }) => ({
      ...item,
      sourceCount: item.sources.length,
      source: item.sources[0] ? item.sources[0].name : item.source
    }))
    .sort((a, b) => {
      const sourceDiff = (b.sourceCount || 1) - (a.sourceCount || 1);
      if (sourceDiff !== 0 && Math.abs(sourceDiff) > 1) return sourceDiff;
      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    });
}

function toSource(item) {
  return {
    name: item.source,
    link: item.link,
    summary: item.summary,
    publishedAt: item.publishedAt
  };
}

function getFingerprint(title) {
  const stopWords = new Set([
    "the", "and", "for", "with", "from", "that", "this", "are", "was", "were", "has", "have", "into",
    "over", "after", "before", "live", "latest", "updates", "news", "says", "said", "will", "amid",
    "google", "news", "bbc", "espn"
  ]);
  return new Set(String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 12));
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }
  return intersection / Math.min(a.size, b.size);
}

function weatherLabel(code) {
  if ([0, 1].includes(code)) return "Mostly clear";
  if ([2, 3].includes(code)) return "Partly sunny";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 61, 63, 65].includes(code)) return "Rain";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Cloudy";
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

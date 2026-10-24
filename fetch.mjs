// Saves the newest posts of each subreddit to feed.json, from Reddit's public RSS feeds.
const SUBS = ['LocalLLaMA', 'AI_Agents', 'selfhosted', 'LocalLLM', 'mcp', 'golang', 'Python', 'ClaudeAI', 'devops']
const MAX_AGE_H = 36
const UA = 'reddit-scout-feed/0.1 (github.com/Parthkomalwad/reddit-scout-feed)'

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const pick = (xml, re) => decode(xml.match(re)?.[1] ?? '').trim()

// One combined feed: Reddit rate-limits separate requests per subreddit (HTTP 429).
async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return res.text()
    if (res.status !== 429 || attempt === 3) throw new Error(`HTTP ${res.status}`)
    await new Promise(r => setTimeout(r, 15000 * attempt))
  }
}

const posts = [], errors = {}
try {
  const xml = await get(`https://www.reddit.com/r/${SUBS.join('+')}/new/.rss?limit=100`)
  for (const entry of xml.split('<entry>').slice(1)) {
    const published = pick(entry, /<published>([^<]+)/) || pick(entry, /<updated>([^<]+)/)
    const ageH = (Date.now() - Date.parse(published)) / 36e5
    if (!(ageH <= MAX_AGE_H)) continue
    const body = pick(entry, /<content[^>]*>([\s\S]*?)<\/content>/).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    posts.push({
      subreddit: pick(entry, /<category term="([^"]+)"/),
      title: pick(entry, /<title>([\s\S]*?)<\/title>/),
      url: pick(entry, /<link href="([^"]+)"/),
      published,
      age_hours: Math.round(ageH),
      snippet: body.replace(/submitted by .*$/, '').slice(0, 400).trim(),
    })
  }
} catch (e) { errors.feed = e.message }

const out = { generated: new Date().toISOString(), subreddits: SUBS, errors, posts }
await import('node:fs').then(fs => fs.writeFileSync('feed.json', JSON.stringify(out, null, 2) + '\n'))
console.log(`${posts.length} posts, errors: ${JSON.stringify(errors)}`)
if (posts.length === 0) process.exitCode = 1

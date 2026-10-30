# To do

## 1. "meesho-researcher" agent (Option A), decided 28 Oct 2026, to be done later
A Claude Code agent that researches online and reports in Hinglish:
- Meesho category for a product
- New product ideas
- Price range
- Search keywords
- Meesho rules

Every point comes with a source link and a confidence level. With approval, it saves reports to `research/` and creates the categories in the app.

Known limits:
- meesho.com blocks scripts (403), so there is no live Meesho data; results come from public web pages.
- Confirm the final category in the Meesho supplier panel (a screenshot of the category list gives exact results).
- No real sales numbers; prices may be out of date.
- Runs only in Claude Code on this laptop, not inside the app.

Steps when we start:
1. Create `.claude/agents/meesho-researcher.md`.
2. Test run: rangoli stencil category and price range.
3. Add the agent to `CLAUDE.md`.

## 2. Later (optional): in-app "Meesho Research" page (Option B)
Needs billing turned on in Google AI Studio, because Google Search with Gemini currently returns a 429 quota error on the free plan.

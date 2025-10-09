# SERP Scraper

A local Node.js application for scraping Google Search and Maps results using Serper.dev API.

## Features

- **Local Operation**: No cloud dependencies, runs entirely on your machine
- **Multiple Providers**: Support for Serper.dev API
- **Flexible Input**: Command line arguments or JSON config file
- **Multiple Modes**: Regular search results or Google Maps business listings
- **Pagination**: Automatic pagination to get more results
- **Local Storage**: Results saved as JSON files

## Installation

```bash
npm install
```

## Usage

### Method 1: Command Line Arguments

```bash
# Basic search
node src/main.js --query "best restaurants in New York" --provider-key YOUR_API_KEY

# Multiple queries
node src/main.js --query "coffee shops" --query "restaurants" --max-results 50

# Maps search
node src/main.js --query "pizza near me" --mode maps --location "New York, NY"

# Full options
node src/main.js \
  --query "your search query" \
  --provider serper \
  --mode search \
  --max-results 100 \
  --location "United States" \
  --language en \
  --output ./results \
  --provider-key YOUR_API_KEY
```

### Method 2: Configuration File

1. Edit `config.json` with your settings
2. Set your `providerKey` in the config file
3. Run: `node src/main.js`

### Command Line Options

- `--query, -q`: Search query (can be used multiple times)
- `--provider, -p`: Provider name (default: serper)
- `--mode, -m`: Mode - 'search' or 'maps' (default: search)
- `--max-results, -r`: Maximum number of results (default: 500)
- `--location, -l`: Search location (default: United States)
- `--language`: Search language (default: en)
- `--output, -o`: Output directory (default: ./output)
- `--provider-key, -k`: API key for the provider

## Output

Results are saved as JSON files in the output directory with the format:
```
{query}_{page}_{timestamp}.json
```

Each file contains:
- Query information
- Page number
- Timestamp
- Array of result items

## API Keys

You need a Serper.dev API key. Get one at: https://serper.dev/

Set it via:
- Environment variable: `PROVIDER_KEY`
- Command line: `--provider-key YOUR_KEY`
- Config file: `"providerKey": "YOUR_KEY"`

## Example Usage

```bash
# Search for restaurants
node src/main.js --query "best restaurants in San Francisco" --max-results 50 --provider-key YOUR_KEY

# Maps search for coffee shops
node src/main.js --query "coffee shops" --mode maps --location "Seattle, WA" --provider-key YOUR_KEY

# Multiple queries with custom output
node src/main.js --query "AI companies" --query "machine learning startups" --output ./my-results --provider-key YOUR_KEY
```

## Configuration File Example

```json
{
  "queries": [
    "best restaurants in New York",
    "coffee shops near me"
  ],
  "provider": "serper",
  "mode": "search",
  "maxResults": 100,
  "location": "United States",
  "language": "en",
  "outputDir": "./output",
  "providerKey": "YOUR_SERPER_API_KEY_HERE"
}
```
import time
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Simple in-memory cache to avoid scraping Google's feed on every load.
# Cache format: { "data": [...], "timestamp": 123456789 }
feed_cache = {
    "data": None,
    "timestamp": 0
}
CACHE_TTL = 3600  # Cache for 1 hour (3600 seconds)

def parse_xml_feed(xml_data):
    """
    Parses the Atom XML feed data and returns a list of dictionaries representing entries.
    """
    root = ET.fromstring(xml_data)
    # The XML namespace used in Google's feed
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    
    entries = []
    for entry_el in root.findall("atom:entry", ns):
        id_el = entry_el.find("atom:id", ns)
        title_el = entry_el.find("atom:title", ns)
        updated_el = entry_el.find("atom:updated", ns)
        content_el = entry_el.find("atom:content", ns)
        
        # Link elements might have different rel attributes.
        # Find the alternate link, or default to the first link.
        link = ""
        for link_el in entry_el.findall("atom:link", ns):
            if link_el.attrib.get("rel") == "alternate":
                link = link_el.attrib.get("href", "")
                break
        
        if not link:
            first_link_el = entry_el.find("atom:link", ns)
            if first_link_el is not None:
                link = first_link_el.attrib.get("href", "")
                
        entries.append({
            "id": id_el.text if id_el is not None else "",
            "title": title_el.text if title_el is not None else "",
            "updated": updated_el.text if updated_el is not None else "",
            "link": link,
            "content": content_el.text if content_el is not None else ""
        })
        
    return entries

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/notes")
def get_release_notes():
    force_refresh = request.args.get("force", "false").lower() == "true"
    current_time = time.time()
    
    # Check cache eligibility
    if not force_refresh and feed_cache["data"] is not None:
        if current_time - feed_cache["timestamp"] < CACHE_TTL:
            return jsonify({
                "source": "cache",
                "last_updated": int(feed_cache["timestamp"]),
                "notes": feed_cache["data"]
            })
            
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravityFeedReader/1.0"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
            
        notes = parse_xml_feed(xml_data)
        
        # Update cache
        feed_cache["data"] = notes
        feed_cache["timestamp"] = current_time
        
        return jsonify({
            "source": "network",
            "last_updated": int(current_time),
            "notes": notes
        })
    except Exception as e:
        # If network call fails but we have cached data, return that with a warning
        if feed_cache["data"] is not None:
            return jsonify({
                "source": "cache_fallback",
                "last_updated": int(feed_cache["timestamp"]),
                "notes": feed_cache["data"],
                "warning": f"Could not refresh feed: {str(e)}. Displaying cached data."
            })
        
        # Otherwise, return error JSON
        return jsonify({
            "error": "Failed to fetch release notes from Google Cloud Feed.",
            "details": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)

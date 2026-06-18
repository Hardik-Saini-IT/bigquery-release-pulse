# BigQuery Release Pulse 🚀

## About the Project
A lightweight web application that fetches and displays the latest release notes directly from the official Google Cloud BigQuery XML feed. It allows developers and data engineers to quickly stay updated with BigQuery changes and instantly share important updates on X (formerly Twitter).

## ✨ Features
* **Real-time Updates:** Fetches the latest release notes directly from the [official BigQuery XML feed](https://docs.cloud.google.com/feeds/bigquery-release-notes.xml).
* **Refresh on Demand:** A clean refresh button with a loading spinner to grab the newest data without reloading the whole page.
* **Click-to-Tweet:** Found an interesting update? Select any specific release note and instantly share it on Twitter with a single click.
* **Clean UI:** Built with simple, vanilla web technologies for a fast and smooth user experience.

## 🛠️ Tech Stack
* **Backend:** Python, Flask
* **Frontend:** Vanilla HTML, CSS, JavaScript
* **Data Source:** Google Cloud BigQuery RSS/XML Feed

## 🚀 How to Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Hardik-Saini-IT/bigquery-release-pulse.git
   cd bigquery-release-pulse
Install dependencies:
Make sure you have Python installed. Then run:

```bash
  pip install flask requests

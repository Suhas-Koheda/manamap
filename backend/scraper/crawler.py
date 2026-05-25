import asyncio
import httpx
import logging
import os
import re
import zipfile
from datetime import datetime
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

logger = logging.getLogger(__name__)

class PlaywrightBrowserManager:
    """Manages a single global instance of Playwright and the Browser Context."""
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.lock = asyncio.Lock()

    async def get_context(self) -> BrowserContext:
        async with self.lock:
            if not self.playwright:
                logger.info("Starting Playwright...")
                self.playwright = await async_playwright().start()
            if not self.browser:
                logger.info("Launching Chromium browser...")
                self.browser = await self.playwright.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-setuid-sandbox"]
                )
            if not self.context:
                logger.info("Creating browser context...")
                self.context = await self.browser.new_context(
                    accept_downloads=True,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                )
            return self.context

    async def close(self):
        async with self.lock:
            if self.context:
                await self.context.close()
                self.context = None
            if self.browser:
                await self.browser.close()
                self.browser = None
            if self.playwright:
                await self.playwright.stop()
                self.playwright = None
            logger.info("Browser session shutdown complete.")

browser_manager = PlaywrightBrowserManager()

class TelanganaTenderScraper:
    def __init__(self, status_callback=None):
        self.status_callback = status_callback
        self.client = httpx.AsyncClient(follow_redirects=False, timeout=30.0)
        self.cookies = {}
        self.context = None

    async def log(self, message: str):
        logger.info(message)
        if self.status_callback:
            await self.status_callback("log", {"message": message})

    async def refresh_session(self):
        """Initializes/refreshes a valid browser session and extracts session cookies."""
        await self.log("[→] Initializing session via Playwright browser...")
        try:
            self.context = await browser_manager.get_context()
            page = await self.context.new_page()
            try:
                # Navigate to the portal's main details home page
                await page.goto("https://tender.telangana.gov.in/TenderDetailsHome.html", wait_until="networkidle", timeout=45000)
                await page.wait_for_selector("table", timeout=20000)
                await self.log("[✓] Portal page loaded. Extracting cookies...")
                
                # Fetch cookies from browser context
                pw_cookies = await self.context.cookies()
                self.cookies = {c["name"]: c["value"] for c in pw_cookies}
                
                # Apply cookies to the HTTP client
                self.client.cookies.update(self.cookies)
                await self.log(f"[✓] Established session cookies: {', '.join(self.cookies.keys())}")
            finally:
                await page.close()
        except Exception as e:
            await self.log(f"[✗] Failed browser handshake: {e}")
            if self.status_callback:
                await self.status_callback("error", {"message": f"Browser handshake failure: {str(e)}"})
            raise

    async def fetch_page(self, start: int, length: int) -> list:
        """Queries TenderDetailsHomeJson.html for a given range of tenders via HTTP, reusing browser cookies."""
        if not self.cookies:
            await self.refresh_session()
            
        url = "https://tender.telangana.gov.in/TenderDetailsHomeJson.html"
        params = {
            "subDeptId": "",
            "ddlDistrict": "",
            "ddlMandal": "",
            "biddingType": "",
            "sProcurementType": "",
            "mECVValue1": "",
            "mECVValue2": "",
            "dtBidClosingselect": "",
            "dtBidClosing1": "",
            "dtBidClosing2": "",
            "dtTenderOpening1": "",
            "dtTenderOpening2": "",
            "nDepartmentID": "0",
            "hdnSearch4": "",
            "hdnSearch": "",
            "hdncorrigendumsDetails": "",
            "hdncorrigendumsDetails1": "",
            "hdnnoSearch": "",
            "hdncorrigendumsDetails2": "",
            "hdnPreviousPage": "",
            "hdnIndentID": "",
            "hdnTenderCategory": "",
            "hdnProcurementID": "",
            "hdnType": "current",
            "hdnPreviousPge": "TenderDetailsHome.html",
            "hdnadvsearch": "",
            "hdnFromStatus": "",
            "typeOfWorkFromConsolidation": "",
            "popUPRequestParameter": "",
            "selectedCircleDivison": "",
            "selectedDepartmentID": "",
            "selectedProcurementType": "",
            "selectedTypeofWork": "",
            "aid": "",
            
            # Datatables parameters
            "sEcho": "1",
            "iColumns": "10",
            "sColumns": "",
            "iDisplayStart": str(start),
            "iDisplayLength": str(length),
            "mDataProp_0": "0",
            "mDataProp_1": "1",
            "mDataProp_2": "2",
            "mDataProp_3": "3",
            "mDataProp_4": "4",
            "mDataProp_5": "5",
            "mDataProp_6": "6",
            "mDataProp_7": "7",
            "mDataProp_8": "8",
            "mDataProp_9": "9",
            "iSortCol_0": "5",
            "sSortDir_0": "desc",
            "iSortingCols": "1",
            "bSortable_0": "true",
            "bSortable_1": "true",
            "bSortable_2": "true",
            "bSortable_3": "true",
            "bSortable_4": "true",
            "bSortable_5": "true",
            "bSortable_6": "true",
            "bSortable_7": "true",
            "bSortable_8": "true",
            "bSortable_9": "false",
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://tender.telangana.gov.in/TenderDetailsHome.html",
            "X-Requested-With": "XMLHttpRequest"
        }
        
        for attempt in range(3):
            try:
                response = await self.client.get(url, params=params, headers=headers, timeout=20.0)
                
                # Check for session timeout redirect
                if response.status_code == 302 and "SessionTimeOut" in response.headers.get("Location", ""):
                    await self.log("[!] Session timeout detected on HTTP request. Re-establishing session via Playwright...")
                    if self.status_callback:
                        await self.status_callback("session_refresh", {})
                    await self.refresh_session()
                    continue
                    
                if response.status_code == 200:
                    try:
                        data = response.json()
                        records = data.get("aaData") or data.get("data") or []
                        await self.log(f"[✓] Retrieved {len(records)} records at offset {start} from portal.")
                        return records
                    except Exception as json_err:
                        await self.log(f"[✗] Failed to parse JSON response: {json_err}")
                        return []
                        
                await self.log(f"[!] HTTP request status: {response.status_code}. Retrying...")
            except Exception as e:
                await self.log(f"[!] Network error on attempt {attempt+1}: {e}")
                
            await asyncio.sleep(2.0)
            
        return []

    async def fetch_details_and_documents(self, indent_id: str, category_id: str, procurement_id: str, dest_dir: str):
        """Opens Playwright pages to load detail/document forms, extract metadata and download attachments."""
        if not self.context:
            self.context = await browser_manager.get_context()
            
        page = await self.context.new_page()
        detail_fields = {}
        docs_list = []
        downloaded_files = []
        
        try:
            # 1. Load details page (using POST form submission simulation inside page context)
            await self.log(f"[→] Loading details page for Indent {indent_id}...")
            post_js = """
            (url, data) => {
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = url;
                for (const [key, value] of Object.entries(data)) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = value;
                    form.appendChild(input);
                }
                document.body.appendChild(form);
                form.submit();
            }
            """
            
            # Go to portal main page domain first to establish the origin
            await page.goto("https://tender.telangana.gov.in/TenderDetailsHome.html")
            
            # Submit POST request in browser to load ViewTender.html
            await page.evaluate(post_js, "https://tender.telangana.gov.in/ViewTender.html", {
                "popUPRequestParameter": "popUPRequestParameter",
                "hdnPreviousPage": "TenderDetailsHome.html",
                "hdnIndentID": indent_id,
                "hdnTenderCategory": category_id,
                "hdnProcurementID": procurement_id
            })
            await page.wait_for_load_state("networkidle")
            
            # Extract detailed fields
            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            for row in soup.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) >= 2:
                    lbl = cells[0].get_text(strip=True).replace(":", "")
                    val = cells[1].get_text(strip=True)
                    if lbl:
                        detail_fields[lbl] = val
                        
            await self.log(f"[✓] Scraped details for Indent {indent_id}. Properties: {len(detail_fields)}")

            # 2. Load document attachments list page
            await self.log(f"[→] Loading document list page for Indent {indent_id}...")
            await page.evaluate(post_js, "https://tender.telangana.gov.in/ViewTenderDocuments.html", {
                "popUPRequestParameter": "popUPRequestParameter",
                "hdnFromStatus": "moretenders",
                "hdnProcurementID": procurement_id,
                "hdnIndentID": indent_id,
                "hdnPreviousPage": "TenderDetailsHome.html"
            })
            await page.wait_for_load_state("networkidle")
            
            docs_html = await page.content()
            docs_soup = BeautifulSoup(docs_html, "html.parser")
            
            # Find the download links calling downloadFun
            for a in docs_soup.find_all("a", onclick=True):
                onclick = a["onclick"]
                match = re.search(r"downloadFun\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", onclick)
                if match:
                    doc_id = match.group(1)
                    doc_name = match.group(2)
                    path_type = match.group(3)
                    docs_list.append({
                        "doc_id": doc_id,
                        "doc_name": doc_name,
                        "path_type": path_type,
                        "title": a.get_text(strip=True) or doc_name
                    })
            await self.log(f"[✓] Document list found: {len(docs_list)} attachments available.")

            # 3. Trigger browser-based expect_download()
            os.makedirs(dest_dir, exist_ok=True)
            for doc in docs_list:
                doc_name = doc["doc_name"]
                doc_id = doc["doc_id"]
                path_type = doc["path_type"]
                local_path = os.path.join(dest_dir, doc_name)
                
                if self.status_callback:
                    await self.status_callback("download", {"filename": doc_name})
                    
                await self.log(f"[→] Downloading attachment: {doc_name}...")
                try:
                    async with page.expect_download(timeout=60000) as download_info:
                        await page.evaluate(f"downloadFun('{doc_id}', '{doc_name}', '{path_type}')")
                    download = await download_info.value
                    await download.save_as(local_path)
                    await self.log(f"[✓] Saved {doc_name} to {local_path} ({os.path.getsize(local_path)} bytes)")
                    downloaded_files.append(local_path)
                except Exception as dl_err:
                    await self.log(f"[✗] Failed to download {doc_name}: {dl_err}")
                    if self.status_callback:
                        await self.status_callback("error", {"message": f"Download failed for {doc_name}: {str(dl_err)}"})
                        
        except Exception as e:
            await self.log(f"[✗] Detail page scraping failed: {e}")
            if self.status_callback:
                await self.status_callback("error", {"message": f"Scraper error: {str(e)}"})
        finally:
            await page.close()
            
        return detail_fields, docs_list, downloaded_files

    def extract_text_from_file(self, filepath: str) -> str:
        """Extracts plain text content from PDF or ZIP files (extracting PDFs inside)."""
        if not filepath or not os.path.exists(filepath):
            return ""
            
        text_content = []
        
        # 1. Handle PDF files
        if filepath.lower().endswith(".pdf"):
            text_content.append(self._read_pdf_text(filepath))
            
        # 2. Handle ZIP files
        elif filepath.lower().endswith(".zip"):
            try:
                extract_dir = filepath + "_extracted"
                os.makedirs(extract_dir, exist_ok=True)
                with zipfile.ZipFile(filepath, 'r') as zip_ref:
                    zip_ref.extractall(extract_dir)
                    
                # Walk through extracted files and read any PDFs
                for root, dirs, files in os.walk(extract_dir):
                    for file in files:
                        if file.lower().endswith(".pdf"):
                            pdf_path = os.path.join(root, file)
                            text_content.append(f"--- Document: {file} ---\n")
                            text_content.append(self._read_pdf_text(pdf_path))
                            
            except Exception as e:
                logger.error(f"Failed to extract zip file {filepath}: {e}")
                
        return "\n".join(text_content)

    def _read_pdf_text(self, pdf_path: str) -> str:
        """Reads plain text from PDF using pypdf."""
        if not PdfReader:
            logger.warning("pypdf is not installed. Text extraction skipped.")
            return ""
            
        text = []
        try:
            reader = PdfReader(pdf_path)
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text.append(page_text)
            return "\n".join(text)
        except Exception as e:
            logger.error(f"Failed to parse PDF text from {pdf_path}: {e}")
            return ""

    async def close(self):
        await self.client.aclose()

import asyncio
import httpx
import random
import logging
import os
import re
import zipfile
from datetime import datetime
import urllib3
from bs4 import BeautifulSoup
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

# Suppress urllib3 warnings for self-signed certificates on government portal
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
]

class TelanganaTenderScraper:
    def __init__(self, max_retries: int = 5, base_delay: float = 2.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.client = httpx.AsyncClient(follow_redirects=False, timeout=30.0)
        self.headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://tender.telangana.gov.in/",
            "X-Requested-With": "XMLHttpRequest"
        }

    async def refresh_session(self):
        """Initializes a valid session and retrieves session cookies."""
        logger.info("Initializing session on Telangana eProcurement portal...")
        try:
            # Hit homepage to get JSESSIONID and Gateway affinity cookies
            await self.client.get("https://tender.telangana.gov.in/", headers=self.headers, timeout=20.0)
            cookies = [f"{c.name}={c.value}" for c in self.client.cookies.jar]
            logger.info(f"Established base cookies: {', '.join(cookies)}")
            
            # Must also hit TenderDetailsHome.html via POST to activate session permissions
            logger.info("Visiting TenderDetailsHome.html via POST to finalize session...")
            await self.client.post("https://tender.telangana.gov.in/TenderDetailsHome.html", headers=self.headers, timeout=20.0)
            logger.info(f"Finalized session cookies: {[f'{c.name}={c.value}' for c in self.client.cookies.jar]}")
        except Exception as e:
            logger.error(f"Failed to initialize session cookies: {e}")
            raise

    async def _request_with_backoff(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Helper to run API calls with exponential backoff and session refresh on redirect."""
        for attempt in range(self.max_retries):
            self.headers["User-Agent"] = random.choice(USER_AGENTS)
            try:
                response = await self.client.request(method, url, headers=self.headers, timeout=20.0, **kwargs)
                
                # If redirected to SessionTimeOut, refresh session and retry
                if response.status_code == 302 and "SessionTimeOut" in response.headers.get("Location", ""):
                    logger.warning(f"Session expired (302 redirect). Refreshing session and retrying (attempt {attempt+1})...")
                    await self.refresh_session()
                    continue
                    
                if response.status_code == 200:
                    return response
                    
                logger.warning(f"Request received status {response.status_code}. Retrying...")
            except Exception as e:
                logger.warning(f"Network error on attempt {attempt+1}: {e}")
                
            sleep_time = (self.base_delay ** attempt) + random.uniform(0.5, 1.5)
            await asyncio.sleep(sleep_time)
            
        raise Exception(f"Failed to query {url} after {self.max_retries} attempts.")

    async def fetch_page(self, start: int, length: int) -> list:
        """Queries TenderDetailsHomeJson.html for a given range of tenders."""
        url = "https://tender.telangana.gov.in/TenderDetailsHomeJson.html"
        
        # Build exact query parameters matching portal advance search serialization
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
        
        # Make sure session is initialized
        if not self.client.cookies.get("JSESSIONID"):
            await self.refresh_session()
            
        try:
            # Query GET endpoint with Datatables parameters
            response = await self._request_with_backoff("GET", url, params=params)
            
            try:
                data = response.json()
                records = data.get("aaData") or data.get("data") or []
                logger.info(f"Retrieved {len(records)} records at offset {start} from portal.")
                return records
            except Exception as json_err:
                logger.error(f"Failed to parse JSON response from {url}: {json_err}")
                return []
                
        except Exception as e:
            logger.error(f"Error executing request at offset {start}: {e}")
            raise

    async def fetch_tender_details(self, indent_id: str, category_id: str, procurement_id: str) -> dict:
        """Fetches structured text fields from ViewTender.html details page."""
        url = "https://tender.telangana.gov.in/ViewTender.html"
        data = {
            "popUPRequestParameter": "popUPRequestParameter",
            "hdnPreviousPage": "TenderDetailsHome.html",
            "hdnIndentID": indent_id,
            "hdnTenderCategory": category_id,
            "hdnProcurementID": procurement_id
        }
        
        detail_fields = {}
        try:
            logger.info(f"Fetching tender details for Indent ID: {indent_id}...")
            response = await self._request_with_backoff("POST", url, data=data)
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Find all table rows containing labels and values
            for row in soup.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) >= 2:
                    lbl = cells[0].get_text(strip=True).replace(":", "")
                    val = cells[1].get_text(strip=True)
                    if lbl:
                        detail_fields[lbl] = val
                        
            logger.info(f"Successfully scraped details with {len(detail_fields)} keys.")
        except Exception as e:
            logger.error(f"Failed to fetch tender details for indent {indent_id}: {e}")
            
        return detail_fields

    async def fetch_tender_documents_list(self, indent_id: str, procurement_id: str) -> list:
        """Fetches the list of document download arguments from ViewTenderDocuments.html."""
        url = "https://tender.telangana.gov.in/ViewTenderDocuments.html"
        data = {
            "popUPRequestParameter": "popUPRequestParameter",
            "hdnFromStatus": "moretenders",
            "hdnProcurementID": procurement_id,
            "hdnIndentID": indent_id,
            "hdnPreviousPage": "TenderDetailsHome.html"
        }
        
        docs = []
        try:
            logger.info(f"Fetching tender documents list for Indent ID: {indent_id}...")
            response = await self._request_with_backoff("POST", url, data=data)
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Find download action links: e.g. downloadFun('850890','8 Medak.zip','TenderDocuments')
            # Look for <a> tags with onclick attributes calling downloadFun
            for a in soup.find_all("a", onclick=True):
                onclick = a["onclick"]
                match = re.search(r"downloadFun\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", onclick)
                if match:
                    doc_id = match.group(1)
                    doc_name = match.group(2)
                    path_type = match.group(3)
                    docs.append({
                        "doc_id": doc_id,
                        "doc_name": doc_name,
                        "path_type": path_type,
                        "title": a.get_text(strip=True) or doc_name
                    })
            logger.info(f"Found {len(docs)} downloadable document attachments.")
        except Exception as e:
            logger.error(f"Failed to fetch document list for indent {indent_id}: {e}")
            
        return docs

    async def download_document(self, doc_id: str, doc_name: str, path_type: str, dest_dir: str) -> str:
        """Downloads document attachment and saves it locally. Returns the local filepath."""
        url = "https://tender.telangana.gov.in/DownLoadFile.html"
        data = {
            "hdndocIds": doc_id,
            "hdndocName": doc_name,
            "hdnsPath": path_type
        }
        
        os.makedirs(dest_dir, exist_ok=True)
        filepath = os.path.join(dest_dir, doc_name)
        
        try:
            logger.info(f"Downloading {doc_name} (ID: {doc_id}) to {filepath}...")
            response = await self._request_with_backoff("POST", url, data=data)
            
            # Write bytes to local file
            with open(filepath, "wb") as f:
                f.write(response.content)
            logger.info(f"Downloaded {len(response.content)} bytes to {filepath}.")
            return filepath
        except Exception as e:
            logger.error(f"Failed to download document {doc_name}: {e}")
            return ""

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

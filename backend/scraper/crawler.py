import asyncio
import httpx
import random
import logging
from datetime import datetime
import urllib3

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
        self.client = httpx.AsyncClient(verify=False, follow_redirects=False)
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

    async def close(self):
        await self.client.aclose()

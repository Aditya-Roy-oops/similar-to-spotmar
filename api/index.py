import imaplib
import email
import email.utils
import base64
import hashlib
import requests
from email.header import decode_header
from datetime import datetime, timedelta, timezone
from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__, template_folder="../templates")
app.secret_key = "allspotmail-secure-serverless-session-key"

# --- SECURE URL DECODING ---
SECURE_CREDS_URL_ENCODED = "aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2FkaHl0eWFydC9jaGVja3BvaW50ZGIvbWFpbi9hdXRoLmpzb24="

def decode_secure_string(encoded_str: str) -> str:
    try:
        decoded_bytes = base64.b64decode(encoded_str.encode('utf-8'))
        return decoded_bytes.decode('utf-8')
    except Exception:
        return encoded_str

def verify_external_credentials(input_id: str, input_pass: str):
    try:
        target_url = decode_secure_string(SECURE_CREDS_URL_ENCODED)
        response = requests.get(target_url, timeout=5)
        if response.status_code != 200:
            return None
            
        credentials_list = response.json()
        for record in credentials_list:
            stored_id = decode_secure_string(record.get("id_enc", ""))
            stored_pass = decode_secure_string(record.get("pass_enc", ""))
            
            if input_id.strip() == stored_id.strip() and input_pass == stored_pass:
                return hashlib.sha256(stored_pass.encode('utf-8')).hexdigest()
        return None
    except Exception:
        return None

def validate_active_session() -> bool:
    if not session.get("authenticated") or not session.get("user") or not session.get("pass_hash"):
        return False
    
    try:
        target_url = decode_secure_string(SECURE_CREDS_URL_ENCODED)
        response = requests.get(target_url, timeout=4)
        if response.status_code != 200:
            return True 
            
        credentials_list = response.json()
        current_user = session.get("user")
        stored_pass_hash = session.get("pass_hash")
        
        for record in credentials_list:
            stored_id = decode_secure_string(record.get("id_enc", ""))
            if stored_id.strip().lower() == current_user.strip().lower():
                actual_pass = decode_secure_string(record.get("pass_enc", ""))
                actual_hash = hashlib.sha256(actual_pass.encode('utf-8')).hexdigest()
                
                if actual_hash == stored_pass_hash:
                    return True
                else:
                    return False
        return False
    except Exception:
        return True


# --- IMAP & DECODING HELPERS ---
def decode_header_value(header_val):
    if not header_val:
        return ""
    decoded_parts = decode_header(header_val)
    result = []
    for text, encoding in decoded_parts:
        if isinstance(text, bytes):
            result.append(text.decode(encoding or "utf-8", errors="ignore"))
        else:
            result.append(str(text))
    return "".join(result)

def extract_email_body(msg):
    html_body = ""
    text_body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if "attachment" not in content_disposition:
                try:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        decoded_content = payload.decode(charset, errors="ignore")
                        if content_type == "text/html":
                            html_body += decoded_content
                        elif content_type == "text/plain":
                            text_body += decoded_content
                except Exception:
                    pass
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                decoded_content = payload.decode(charset, errors="ignore")
                if msg.get_content_type() == "text/html":
                    html_body = decoded_content
                else:
                    text_body = decoded_content
        except Exception:
            pass
    return html_body if html_body else f"<pre>{text_body}</pre>"

def detect_sending_source(msg, from_email):
    headers_str = "".join([str(v) for k, v in msg.items()]).lower()
    received_str = " ".join(msg.get_all("Received", [])).lower()
    combined = headers_str + " " + received_str + " " + from_email.lower()
    
    if "klaviyo" in combined or "uclm" in combined:
        return "Klaviyo"
    elif "mailchimp" in combined or "mcsv.net" in combined:
        return "Mailchimp"
    elif "sendgrid" in combined or "em." in combined:
        return "SendGrid"
    elif "amazonses" in combined or "amazon" in combined:
        return "Amazon SES"
    elif "postmark" in combined or "pm.mtasv.net" in combined:
        return "Postmark"
    elif "hubspot" in combined or "hs-tarmail" in combined:
        return "HubSpot"
    elif "salesforce" in combined or "exacttarget" in combined or "marketingcloud" in combined:
        return "Salesforce MC"
    elif "mailgun" in combined or "mg." in combined:
        return "Mailgun"
    elif "brevo" in combined or "sendinblue" in combined:
        return "Brevo"
    elif "activecampaign" in combined or "ac-inbox" in combined:
        return "ActiveCampaign"
    elif "google" in combined or "gmail" in combined:
        return "Google / Gmail"
    elif "microsoft" in combined or "outlook" in combined or "protection.outlook.com" in combined:
        return "Microsoft 365"
    elif "smtp" in combined:
        return "SMTP"
    else:
        return "Other / Direct"


# --- ROUTING & AUTHENTICATION ---

@app.route("/")
def home():
    if validate_active_session():
        return render_template("shell.html")
    session.clear()
    return render_template("index.html")

@app.route("/head-mixer-v1")
def head_mixer_v1_route():
    if not validate_active_session():
        session.clear()
        return render_template("index.html")
    return render_template("head-mixer-v1.html")

@app.route("/head-mixer-v2")
def head_mixer_v2_route():
    if not validate_active_session():
        session.clear()
        return render_template("index.html")
    return render_template("head-mixer-v2.html")

@app.route("/random-wikipedia")
def random_wikipedia_route():
    if not validate_active_session():
        session.clear()
        return render_template("index.html")
    return render_template("random-wikipedia.html")

@app.route("/api/login", methods=["POST"])
def login_api():
    data = request.json or {}
    username = data.get("username", "")
    password = data.get("password", "")
    
    pass_hash = verify_external_credentials(username, password)
    if pass_hash:
        session.permanent = True
        session["authenticated"] = True
        session["user"] = username.strip()
        session["pass_hash"] = pass_hash
        return jsonify({"status": "success", "redirect": "/"})
    
    return jsonify({"status": "error", "message": "Invalid access credentials"}), 401

@app.route("/api/logout", methods=["POST"])
def logout_api():
    session.clear()
    return jsonify({"status": "success"})


@app.route("/api/load-payload", methods=["GET"])
def load_payload():
    if not validate_active_session():
        session.clear()
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    try:
        with open("templates/script.html", "r", encoding="utf-8") as f:
            real_code = f.read()
            
        encoded_payload = base64.b64encode(real_code.encode("utf-8")).decode("utf-8")
        return jsonify({"status": "success", "payload": encoded_payload})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route("/api/fetch-chunk", methods=["POST"])
def fetch_chunk_api():
    if not validate_active_session():
        session.clear()
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    data = request.json or {}
    accounts = data.get("accounts", [])
    date_from_str = data.get("date")
    date_to_str = data.get("date_to")
    offset = int(data.get("offset", 0))
    limit = int(data.get("limit", 7))
    known_ids = set(data.get("known_ids", []))
    is_incremental = bool(data.get("is_incremental", False))
    
    tz_offset_minutes = int(data.get("tz_offset", 0))
    client_tz = timezone(timedelta(minutes=-tz_offset_minutes))
    
    try:
        date_from = datetime.strptime(date_from_str, "%Y-%m-%d").date() if date_from_str else datetime.now(client_tz).date()
    except ValueError:
        date_from = datetime.now(client_tz).date()

    try:
        date_to = datetime.strptime(date_to_str, "%Y-%m-%d").date() if date_to_str else date_from
    except ValueError:
        date_to = date_from

    if date_from > date_to:
        date_from, date_to = date_to, date_from

    start_dt = datetime(date_from.year, date_from.month, date_from.day, 0, 0, 0, tzinfo=client_tz)
    end_dt = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, 999999, tzinfo=client_tz)

    # Widen IMAP search by 1 day on each side to safely cover all timezones
    imap_since = (date_from - timedelta(days=1)).strftime("%d-%b-%Y")
    imap_before = (date_to + timedelta(days=2)).strftime("%d-%b-%Y")
    
    all_fetched_emails = []
    any_account_has_more = False

    for acc in accounts:
        password = acc.get("app_password", "").strip()
        spot_id = acc.get("spot_id", "").strip()
        if not password or not spot_id:
            continue
            
        mail = None
        try:
            mail = imaplib.IMAP4_SSL("imap.mail.yahoo.com", 993)
            mail.login(spot_id, password)
            mail.select("INBOX", readonly=True)

            status, response = mail.uid("search", None, f'SINCE "{imap_since}" BEFORE "{imap_before}"')
            if status != "OK" or not response[0]:
                continue

            raw_uids = [m.decode() for m in response[0].split()]
            if not raw_uids:
                continue

            # Batch-fetch ONLY the Date headers for all candidate UIDs in a single IMAP call
            # This prevents wasting multiple 7-item frontend chunks skipping newer dates
            uid_set_str = ",".join(raw_uids)
            res_hdrs, hdrs_data = mail.uid("fetch", uid_set_str, "(BODY.PEEK[HEADER.FIELDS (DATE)])")
            
            valid_uids = []
            if res_hdrs == "OK" and hdrs_data:
                for item in hdrs_data:
                    if isinstance(item, tuple) and len(item) >= 2:
                        # Extract UID from response metadata e.g. b'123 (UID 45678 BODY[...]'
                        meta_str = item[0].decode("utf-8", errors="ignore")
                        uid_val = None
                        if "UID " in meta_str:
                            try:
                                uid_val = meta_str.split("UID ")[1].split()[0].rstrip(")")
                            except Exception:
                                uid_val = None
                        if not uid_val:
                            continue

                        raw_hdr = item[1].decode("utf-8", errors="ignore")
                        hdr_msg = email.message_from_string(raw_hdr)
                        date_hdr = hdr_msg.get("Date", "")
                        if date_hdr:
                            try:
                                parsed_dt = email.utils.parsedate_to_datetime(date_hdr)
                                if parsed_dt.tzinfo is None:
                                    parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                                local_dt = parsed_dt.astimezone(client_tz)
                                
                                if start_dt <= local_dt <= end_dt:
                                    valid_uids.append(uid_val)
                            except Exception:
                                continue

            # Sort ONLY the exact date-matched UIDs newest -> oldest
            valid_uids = sorted(list(set(valid_uids)), key=lambda x: int(x), reverse=True)
            total_valid = len(valid_uids)

            if offset >= total_valid:
                continue

            chunk_uids = valid_uids[offset : offset + limit]
            account_has_more = (offset + limit) < total_valid
            
            for uid in chunk_uids:
                unique_email_id = f"{spot_id}_{uid}"

                # In incremental timer check, stop immediately once we hit an already-loaded UID
                if is_incremental and unique_email_id in known_ids:
                    account_has_more = False
                    break

                try:
                    res, msg_data = mail.uid("fetch", str(uid), "(RFC822)")
                    if res != "OK" or not msg_data or not msg_data[0]:
                        continue
                        
                    raw_email = msg_data[0][1]
                    msg = email.message_from_bytes(raw_email)
                    
                    subject = decode_header_value(msg.get("Subject", "(No Subject)"))
                    from_str = decode_header_value(msg.get("From", "Unknown"))
                    
                    real_name, email_addr = email.utils.parseaddr(from_str)
                    from_name = real_name if real_name else email_addr
                    from_email = email_addr if email_addr else from_str
                    date_sent = msg.get("Date", "")
                    
                    raw_message_id = msg.get("Message-ID", "")
                    clean_msg_id = raw_message_id.strip()
                    if clean_msg_id.startswith("<") and clean_msg_id.endswith(">"):
                        clean_msg_id = clean_msg_id[1:-1].strip()
                    
                    return_path_raw = msg.get("Return-Path", "")
                    clean_return_path = return_path_raw.strip()
                    if clean_return_path.startswith("<") and clean_return_path.endswith(">"):
                        clean_return_path = clean_return_path[1:-1].strip()

                    source_type = detect_sending_source(msg, from_email)
                    body_content = extract_email_body(msg)
                    
                    all_fetched_emails.append({
                        "id": unique_email_id,
                        "uid": int(uid),
                        "account": spot_id,
                        "from_name": from_name,
                        "from_email": from_email,
                        "subject": subject,
                        "date": date_sent,
                        "source": source_type,
                        "content": body_content,
                        "message_id": clean_msg_id,
                        "return_path": clean_return_path
                    })
                except Exception:
                    continue

            if account_has_more:
                any_account_has_more = True

        except Exception:
            pass
        finally:
            if mail:
                try:
                    mail.logout()
                except Exception:
                    pass

    return jsonify({
        "status": "success",
        "emails": all_fetched_emails,
        "has_more": any_account_has_more
    })

if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True, port=5000)

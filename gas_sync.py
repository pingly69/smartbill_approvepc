import urllib.request
import urllib.parse
import json
import time
import os
import sys

CLASPRC_PATH = r'C:\Users\pingl\.clasprc.json'

def get_access_token():
    if not os.path.exists(CLASPRC_PATH):
        raise FileNotFoundError(f"Credentials file not found at {CLASPRC_PATH}")

    with open(CLASPRC_PATH, 'r', encoding='utf-8') as f:
        clasprc = json.load(f)

    creds = clasprc['tokens']['default']
    data = urllib.parse.urlencode({
        'client_id': creds['client_id'],
        'client_secret': creds['client_secret'],
        'refresh_token': creds['refresh_token'],
        'grant_type': 'refresh_token'
    }).encode()

    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    res = urllib.request.urlopen(req)
    tok = json.loads(res.read())

    access_token = tok['access_token']
    creds['access_token'] = access_token
    creds['expiry_date'] = int((time.time() + tok.get('expires_in', 3600)) * 1000)

    with open(CLASPRC_PATH, 'w', encoding='utf-8') as f:
        json.dump(clasprc, f, indent=2)

    return access_token

def get_script_id():
    clasp_path = os.path.join(os.getcwd(), '.clasp.json')
    if os.path.exists(clasp_path):
        with open(clasp_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            script_id = data.get('scriptId')
            if script_id:
                return script_id
    raise FileNotFoundError("ไม่พบไฟล์ .clasp.json หรือไม่มี scriptId ในโปรเจกต์นี้")

def pull():
    access_token = get_access_token()
    script_id = get_script_id()
    
    url = f'https://script.googleapis.com/v1/projects/{script_id}/content'
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'Bearer {access_token}')
    
    res = urllib.request.urlopen(req)
    content = json.loads(res.read())
    
    files = content.get('files', [])
    print(f"Pulled {len(files)} file(s) from Google Apps Script (Project ID: {script_id}):")
    
    for f_obj in files:
        name = f_obj.get('name')
        file_type = f_obj.get('type')
        source = f_obj.get('source', '')
        
        if file_type == 'JSON' and name == 'appsscript':
            filename = 'appsscript.json'
        elif file_type == 'SERVER_JS':
            filename = f"{name}.js"
        elif file_type == 'HTML':
            filename = f"{name}.html"
        else:
            filename = f"{name}.gs"
            
        print(f"  [+] {filename} ({file_type})")
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(source)

def push():
    access_token = get_access_token()
    script_id = get_script_id()
    
    files_payload = []
    
    # appsscript.json
    if os.path.exists('appsscript.json'):
        with open('appsscript.json', 'r', encoding='utf-8') as f:
            files_payload.append({
                'name': 'appsscript',
                'type': 'JSON',
                'source': f.read()
            })
    else:
        files_payload.append({
            'name': 'appsscript',
            'type': 'JSON',
            'source': '{"timeZone":"Asia/Bangkok","dependencies":{},"exceptionLogging":"STACKDRIVER","runtimeVersion":"V8"}'
        })
        
    for fname in os.listdir('.'):
        if fname in ('appsscript.json', 'gas_sync.py', 'app.js', 'styles.css') or fname.startswith('.'):
            continue
        
        full_path = os.path.join('.', fname)
        if not os.path.isfile(full_path):
            continue
            
        name, ext = os.path.splitext(fname)
        ext = ext.lower()
        
        if ext in ('.js', '.gs'):
            with open(full_path, 'r', encoding='utf-8') as f:
                files_payload.append({
                    'name': name,
                    'type': 'SERVER_JS',
                    'source': f.read()
                })
            print(f"  [PUSH] Including {fname} as SERVER_JS")
        elif ext == '.html':
            with open(full_path, 'r', encoding='utf-8') as f:
                files_payload.append({
                    'name': name,
                    'type': 'HTML',
                    'source': f.read()
                })
            print(f"  [PUSH] Including {fname} as HTML")

    url = f'https://script.googleapis.com/v1/projects/{script_id}/content'
    payload_data = json.dumps({'files': files_payload}).encode('utf-8')
    
    req = urllib.request.Request(url, data=payload_data, method='PUT')
    req.add_header('Authorization', f'Bearer {access_token}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        res = urllib.request.urlopen(req)
        resp_data = json.loads(res.read())
        print(f"Push code successful to Google Apps Script (Project ID: {script_id})!")

        # Create a new version automatically
        v_url = f'https://script.googleapis.com/v1/projects/{script_id}/versions'
        v_req = urllib.request.Request(v_url, data=json.dumps({'description': 'Auto deploy from gas_sync.py'}).encode('utf-8'), method='POST')
        v_req.add_header('Authorization', f'Bearer {access_token}')
        v_req.add_header('Content-Type', 'application/json')
        v_res = urllib.request.urlopen(v_req)
        v_data = json.loads(v_res.read())
        new_version = v_data.get('versionNumber')
        print(f"  [VERSION] Created new Version #{new_version}")

        # Update existing deployments to point to the new version
        d_url = f'https://script.googleapis.com/v1/projects/{script_id}/deployments'
        d_req = urllib.request.Request(d_url)
        d_req.add_header('Authorization', f'Bearer {access_token}')
        d_res = urllib.request.urlopen(d_req)
        d_data = json.loads(d_res.read())

        for dep in d_data.get('deployments', []):
            dep_id = dep.get('deploymentId')
            # Update web app deployment
            upd_url = f'https://script.googleapis.com/v1/projects/{script_id}/deployments/{dep_id}'
            upd_payload = {
                'deploymentConfig': {
                    'scriptId': script_id,
                    'versionNumber': new_version,
                    'manifestFileName': 'appsscript'
                }
            }
            upd_req = urllib.request.Request(upd_url, data=json.dumps(upd_payload).encode('utf-8'), method='PUT')
            upd_req.add_header('Authorization', f'Bearer {access_token}')
            upd_req.add_header('Content-Type', 'application/json')
            try:
                urllib.request.urlopen(upd_req)
                print(f"  [DEPLOY] Updated Deployment {dep_id} to Version #{new_version}")
            except Exception as ex:
                pass

        print(f"[SUCCESS] Auto-deployment completed! WebApp is now running Version #{new_version}.")

    except urllib.error.HTTPError as e:
        print(f"Error pushing to Google Apps Script: {e}")
        print(e.read().decode('utf-8'))
        sys.exit(1)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'pull'
    if cmd == 'pull':
        pull()
    elif cmd == 'push':
        push()
    else:
        print("Usage: python gas_sync.py [pull|push]")

# HTTPS Setup for EC2 Backend

## Problem
Vercel frontend (HTTPS) cannot make requests to HTTP backend due to Mixed Content policy.

## Solution Options

### Option 1: Nginx Reverse Proxy with Let's Encrypt (Recommended)

This is the most common and free solution.

#### Step 1: Install Nginx
```bash
sudo yum update -y
sudo yum install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### Step 2: Install Certbot (Let's Encrypt)
```bash
sudo yum install certbot python3-certbot-nginx -y
```

#### Step 3: Configure Nginx
Create/edit `/etc/nginx/conf.d/backend.conf`:

```nginx
server {
    listen 80;
    server_name api.factiomed.com;  # Or use your domain

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Step 4: Get SSL Certificate
```bash
sudo certbot --nginx -d api.factiomed.com
# Follow the prompts to get SSL certificate
```

#### Step 5: Update Frontend Config
Change `frontend/src/config.js` to use HTTPS:
```javascript
const API_BASE_URL = 'https://api.factiomed.com';
```

### Option 2: Use AWS Application Load Balancer (ALB)

1. Create ALB in AWS Console
2. Add SSL certificate (AWS Certificate Manager)
3. Configure target group pointing to EC2:3001
4. Update frontend to use ALB HTTPS endpoint

### Option 3: Cloudflare Tunnel (Free, No Domain Needed)

```bash
# Install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Create tunnel
cloudflared tunnel create functiomed-backend

# Run tunnel
cloudflared tunnel --url http://localhost:3001
```

This gives you a free HTTPS URL like: `https://xxxxx.trycloudflare.com`

### Option 4: Quick Fix - Use Vercel Proxy (Temporary)

Add `vercel.json` to frontend root:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "http://3.70.248.124:3001/api/:path*"
    }
  ]
}
```

Then update frontend config to use relative paths:
```javascript
export const API_BASE = '/api';
```

This proxies through Vercel's HTTPS infrastructure.

## Recommended: Option 4 (Vercel Proxy) for Quick Fix

This is the fastest solution that doesn't require domain or SSL setup.


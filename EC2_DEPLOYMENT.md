# EC2 Deployment Configuration

## Frontend (Vercel)
- **URL:** https://factiomed.vercel.app
- **Status:** ✅ Configured to use EC2 backend

## Backend (EC2)
- **IP Address:** 3.70.248.124
- **API Port:** 3001
- **Ollama Port:** 11434 (if Ollama is on the same EC2 instance)

## EC2 Security Group - Inbound Rules Required

You need to enable the following ports in your EC2 Security Group:

### 1. Backend API Server (Port 3001)
- **Type:** Custom TCP
- **Port:** 3001
- **Source:** 0.0.0.0/0 (or restrict to Vercel IPs if preferred)
- **Description:** Backend API server for Functiomed chatbot

### 2. Ollama Service (Port 11434)
- **Type:** Custom TCP
- **Port:** 11434
- **Source:** 127.0.0.1/32 (localhost only - Ollama should only be accessible from the EC2 instance itself)
- **Description:** Ollama LLM service (internal only)

**Note:** If Ollama is running on a different server, you don't need to open port 11434 on this EC2 instance.

## Configuration Changes Made

### Backend (`backend/server.js`)
- ✅ Updated CORS to allow `https://factiomed.vercel.app`
- ✅ Added support for all Vercel preview deployments
- ✅ Configured credentials and proper headers

### Frontend (`frontend/src/config.js`)
- ✅ Configured to use EC2 backend: `http://3.70.248.124:3001`
- ✅ All API calls now route to EC2 instance

### Environment Variables

**Backend `.env` file should include:**
```
OLLAMA_BASE_URL=http://3.70.248.124:11434
PORT=3001
```

**Note:** If Ollama is on the same EC2, use `http://localhost:11434` or `http://127.0.0.1:11434` instead.

## Testing

1. **Test Backend Health:**
   ```bash
   curl http://3.70.248.124:3001/api/health
   ```

2. **Test from Vercel Frontend:**
   - Visit https://factiomed.vercel.app
   - Try sending a message in the chatbot
   - Check browser console for any CORS errors

## Security Recommendations

1. **Restrict Port 3001 Access:**
   - Instead of `0.0.0.0/0`, consider restricting to:
     - Vercel IP ranges (check Vercel docs for current IPs)
     - Your specific IP addresses
     - Or use a load balancer with security groups

2. **Ollama Port (11434):**
   - Should ONLY be accessible from localhost (127.0.0.1)
   - Never expose Ollama to the internet

3. **Use HTTPS:**
   - Consider setting up nginx reverse proxy with SSL certificate
   - Or use AWS Application Load Balancer with SSL termination

## Troubleshooting

### CORS Errors
- Check that `https://factiomed.vercel.app` is in the CORS origin list
- Verify backend is running on port 3001
- Check EC2 security group allows port 3001

### Connection Refused
- Verify backend server is running: `pm2 list` or `ps aux | grep node`
- Check EC2 security group inbound rules
- Verify port 3001 is not blocked by firewall: `sudo netstat -tlnp | grep 3001`

### Ollama Connection Issues
- If Ollama is on same EC2, use `http://localhost:11434` in `.env`
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check Ollama service status: `systemctl status ollama`


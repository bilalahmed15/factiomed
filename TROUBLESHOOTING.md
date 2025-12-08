# Troubleshooting EC2 Backend Connection

## Issue: Connection Refused on Port 3001

### Step 1: Check if Server is Running

```bash
# Check if Node.js process is running
ps aux | grep node

# Or if using PM2
pm2 list

# Check if port 3001 is listening
sudo netstat -tlnp | grep 3001
# Or
sudo ss -tlnp | grep 3001
```

### Step 2: Verify Server is Listening on All Interfaces

The server should be configured to listen on `0.0.0.0` (all interfaces), not just `localhost`.

**Check server.js:**
```javascript
app.listen(PORT, '0.0.0.0', async () => {
  // This makes it accessible from outside
});
```

### Step 3: Check EC2 Security Group

1. Go to AWS Console → EC2 → Security Groups
2. Select your EC2 instance's security group
3. **Inbound Rules** should include:
   - **Type:** Custom TCP
   - **Port:** 3001
   - **Source:** 0.0.0.0/0 (or specific IPs)
   - **Description:** Backend API

### Step 4: Check EC2 Firewall (if enabled)

```bash
# Check if firewall is blocking port 3001
sudo firewall-cmd --list-ports
sudo firewall-cmd --list-all

# If firewall is active, allow port 3001
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### Step 5: Test from Inside EC2

```bash
# Test from localhost
curl http://localhost:3001/api/health

# Test from private IP
curl http://172.31.29.224:3001/api/health

# Test from public IP (should work after security group is configured)
curl http://3.70.248.124:3001/api/health
```

### Step 6: Check Server Logs

```bash
# If using PM2
pm2 logs

# If running directly
# Check the terminal where server is running
# Look for: "Server running on http://0.0.0.0:3001"
```

### Step 7: Restart Server

```bash
# If using PM2
pm2 restart all
# Or
pm2 restart server

# If running directly
# Stop current process (Ctrl+C) and restart:
cd /path/to/backend
npm start
```

## Common Issues

### Issue: "EADDRINUSE" - Port Already in Use

```bash
# Find process using port 3001
sudo lsof -i :3001
# Or
sudo fuser -k 3001/tcp

# Kill the process
kill -9 <PID>
```

### Issue: Server Starts but Can't Connect

1. **Check binding:** Server must listen on `0.0.0.0`, not `127.0.0.1`
2. **Check security group:** Port 3001 must be open
3. **Check firewall:** EC2 firewall might be blocking

### Issue: Works Locally but Not from Internet

1. **Security Group:** Most common issue - port not open in security group
2. **Network ACLs:** Check VPC Network ACLs
3. **Route Tables:** Verify routing is correct

## Quick Fix Commands

```bash
# 1. Check if server is running
ps aux | grep node

# 2. Check if port is listening
sudo netstat -tlnp | grep 3001

# 3. Test locally
curl http://localhost:3001/api/health

# 4. Check security group (AWS Console)
# Go to EC2 → Security Groups → Your SG → Inbound Rules

# 5. Restart server
pm2 restart all
# Or
cd /path/to/backend && npm start
```

## Expected Output

When server starts correctly, you should see:
```
Server running on http://0.0.0.0:3001 (accessible from all interfaces)
Local access: http://localhost:3001
External access: http://3.70.248.124:3001
```

## Testing After Fix

```bash
# From EC2 instance
curl http://localhost:3001/api/health

# From your local machine
curl http://3.70.248.124:3001/api/health

# Expected response:
# {"status":"ok","timestamp":"2024-..."}
```


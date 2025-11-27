# Troubleshooting Guide: http://localhost:3000/ Won't Load

## Quick Diagnosis

Run the diagnostic script:
```bash
./check_servers.sh
```

## Common Issues and Solutions

### 1. **Accessing from Remote Machine**

If you're accessing from another computer, use the server's IP address instead of `localhost`:

- **Local access**: `http://localhost:3000`
- **Remote access**: `http://10.128.0.2:3000` (use your server's actual IP)

### 2. **Browser Cache Issues**

Clear your browser cache or try:
- **Hard refresh**: `Ctrl+Shift+R` (Linux/Windows) or `Cmd+Shift+R` (Mac)
- **Incognito/Private mode**: Open in a new incognito window
- **Clear cache**: Browser settings → Clear browsing data

### 3. **JavaScript Errors in Browser**

Open browser Developer Tools (F12) and check:
- **Console tab**: Look for red error messages
- **Network tab**: Check if files are loading (status 200 = OK, 404 = not found)

### 4. **Servers Not Running**

Check if servers are actually running:
```bash
# Check processes
ps aux | grep -E 'node server.js|react-scripts'

# Check ports
netstat -tuln | grep -E ':(3000|5001)'
```

If not running, restart them:
```bash
# Terminal 1 - Backend
cd /home/andrewfoudriat/GENTEX-DEMO/backend
node server.js

# Terminal 2 - Frontend  
cd /home/andrewfoudriat/GENTEX-DEMO/frontend
npm start
```

### 5. **Firewall Blocking Access**

If accessing remotely, check firewall:
```bash
# Check iptables
sudo iptables -L -n | grep -E '(3000|5001)'

# Check ufw (if installed)
sudo ufw status
```

### 6. **Port Already in Use**

If ports are in use by another process:
```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process (replace PID with actual process ID)
kill -9 <PID>
```

### 7. **React App Build Issues**

If the React app isn't loading, try rebuilding:
```bash
cd /home/andrewfoudriat/GENTEX-DEMO/frontend
rm -rf node_modules build
npm install
npm start
```

## Verification Steps

1. **Test backend directly**:
   ```bash
   curl http://localhost:5001/api/health
   ```
   Should return: `{"ok":true}`

2. **Test frontend directly**:
   ```bash
   curl http://localhost:3000/
   ```
   Should return HTML with `<title>Gentex Corporation</title>`

3. **Check server logs**:
   - Backend: Check terminal where `node server.js` is running
   - Frontend: Check terminal where `npm start` is running

## Still Not Working?

1. Check browser console (F12) for errors
2. Check network tab (F12) to see if requests are being made
3. Try a different browser
4. Check if you can access `http://localhost:5001/api/health` directly
5. Verify both terminals show servers are running without errors



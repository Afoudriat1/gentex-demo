# Systemd Services for Gentex Demo

These systemd service files allow your backend and frontend to run as system services on your GCP VM, so they continue running even after you close your SSH session.

## Files

- `gentex-backend.service` - Backend server (port 5001)
- `gentex-frontend.service` - Frontend React app (port 3000)

## Installation on GCP VM

### 1. Copy service files to systemd directory

```bash
# SSH into your GCP VM
gcloud compute ssh instance-20251103-164336

# Copy the service files (adjust path if needed)
sudo cp ~/GENTEX-DEMO/systemd/gentex-backend.service /etc/systemd/system/
sudo cp ~/GENTEX-DEMO/systemd/gentex-frontend.service /etc/systemd/system/
```

### 2. Update paths in service files (if needed)

Check that the paths match your VM setup:

```bash
# Check your actual paths
echo "Backend path: $(realpath ~/GENTEX-DEMO/backend)"
echo "Frontend path: $(realpath ~/GENTEX-DEMO/my-react-app)"
echo "Node path: $(which node)"
echo "NPM path: $(which npm)"
```

If paths differ, edit the service files:
```bash
sudo nano /etc/systemd/system/gentex-backend.service
sudo nano /etc/systemd/system/gentex-frontend.service
```

### 3. Reload systemd and enable services

```bash
# Reload systemd to recognize new services
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable gentex-backend.service
sudo systemctl enable gentex-frontend.service
```

### 4. Start the services

```bash
# Start backend
sudo systemctl start gentex-backend.service

# Start frontend
sudo systemctl start gentex-frontend.service
```

### 5. Check status

```bash
# Check backend status
sudo systemctl status gentex-backend.service

# Check frontend status
sudo systemctl status gentex-frontend.service

# View logs
sudo journalctl -u gentex-backend.service -f
sudo journalctl -u gentex-frontend.service -f
```

## Managing Services

### Start/Stop/Restart

```bash
# Backend
sudo systemctl start gentex-backend.service
sudo systemctl stop gentex-backend.service
sudo systemctl restart gentex-backend.service

# Frontend
sudo systemctl start gentex-frontend.service
sudo systemctl stop gentex-frontend.service
sudo systemctl restart gentex-frontend.service
```

### View Logs

```bash
# Backend logs (last 50 lines)
sudo journalctl -u gentex-backend.service -n 50

# Frontend logs (follow in real-time)
sudo journalctl -u gentex-frontend.service -f

# Both services logs
sudo journalctl -u gentex-backend.service -u gentex-frontend.service -f
```

### Check if services are running

```bash
# Check status
sudo systemctl is-active gentex-backend.service
sudo systemctl is-active gentex-frontend.service

# Check listening ports
sudo netstat -tlnp | grep -E ':(3000|5001)'
```

## Troubleshooting

### Service won't start

1. Check the service status:
   ```bash
   sudo systemctl status gentex-backend.service
   ```

2. Check logs for errors:
   ```bash
   sudo journalctl -u gentex-backend.service -n 100
   ```

3. Verify paths exist:
   ```bash
   ls -la ~/GENTEX-DEMO/backend/server.js
   ls -la ~/GENTEX-DEMO/my-react-app/package.json
   ```

4. Test manually:
   ```bash
   cd ~/GENTEX-DEMO/backend
   node server.js
   ```

### Port already in use

If port 3000 or 5001 is already in use:
```bash
# Find what's using the port
sudo lsof -i :5001
sudo lsof -i :3000

# Kill the process (replace PID with actual process ID)
sudo kill -9 <PID>
```

### Update environment variables

To change the llama-server URL or other settings, edit the service file:
```bash
sudo nano /etc/systemd/system/gentex-backend.service
# Update Environment="LLAMA_SERVER_URL=..." line
sudo systemctl daemon-reload
sudo systemctl restart gentex-backend.service
```

## Firewall Configuration

Make sure ports 3000 and 5001 are open in GCP firewall:

```bash
# From your local machine (not the VM)
gcloud compute firewall-rules create allow-frontend-port-3000 \
  --allow tcp:3000 \
  --source-ranges 0.0.0.0/0 \
  --description "Allow frontend access on port 3000"

gcloud compute firewall-rules create allow-backend-port-5001 \
  --allow tcp:5001 \
  --source-ranges 0.0.0.0/0 \
  --description "Allow backend access on port 5001"
```

## Access Your Services

Once running, access your services at:
- Frontend: `http://YOUR_GCP_EXTERNAL_IP:3000`
- Backend: `http://YOUR_GCP_EXTERNAL_IP:5001`

Find your external IP:
```bash
curl -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip
```







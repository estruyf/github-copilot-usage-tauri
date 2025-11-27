# GitHub Device Flow Example

Run the following to start the device flow (this example uses the VS Code client
id):

```bash
curl -X POST https://github.com/login/device/code \
  -H "Accept: application/json" \
  -d "client_id=Iv1.b507a08c87ecfe98&scope=user:email"
```

Example returned response (copy/paste):

```
device_code=626630f8c81260c3bfb931491cd960f09236cade&expires_in=899&interval=5&user_code=3F40-7A91&verification_uri=https%3A%2F%2Fgithub.com%2Flogin%2Fdevice%
```

- `device_code`: 626630f8c81260c3bfb931491cd960f09236cade
- `user_code`: 3F40-7A91
- `expires_in`: 899
- `interval`: 5
- `verification_uri`: https://github.com/login/device

Open the verification URL and enter the `user_code` to authorize the device.

curl https://github.com/login/oauth/access_token -X POST -d
'client_id=01ab8ac9400c4e429b23&scope=user:email&device_code=dfa15832b853790472471ad660fc4c7b45fa471c&grant_type=urn:ietf:params:oauth:grant-type:device_code'
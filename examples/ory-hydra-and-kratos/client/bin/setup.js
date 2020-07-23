const axios = require('axios');

const hydraAdmin = axios.create({
  baseURL: process.env.HYDRA_ADMIN_URL,
  headers: {
    Accept: 'application/json',
  },
});

const client_body = {
  client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID,
  client_name: process.env.OAUTH_CLIENT_NAME,
  scope: process.env.NEXT_PUBLIC_OAUTH_SCOPES,
  token_endpoint_auth_method: 'none',
  redirect_uris: [process.env.NEXT_PUBLIC_SELF_URL],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
};

const sleep = async (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createOAuthClient = async () => {
  try {
    const res = await hydraAdmin.post('/clients', client_body);
    console.log(
      'Successfully created OAuth client with ID:',
      res.data.client_id
    );
  } catch (err) {
    if (err.response) {
      console.error(
        `Client creation failed with status code: ${err.response.status}`
      );
      console.error(err.response.data);
    } else if (err.request) {
      console.error('Client creation failed. No response received.');
      console.error(err.request);
    } else {
      console.error('Client creation failed. An unknown error occurred.');
      console.error(err);
    }

    process.exit(1);
  }
};

(async () => {
  try {
    // Wait for Hydra to boot up
    await sleep(5000);

    // Check to see if the client exists
    await hydraAdmin.get(`/clients/${client_body.client_id}`);
  } catch {
    console.log(
      'OAuth client does not exist. Creating client with ID:',
      client_body.client_id
    );
    return createOAuthClient();
  }

  // Client already exists
  try {
    console.log(
      'OAuth client already exists. Ensuring it has up-to-date content...'
    );
    await hydraAdmin.put(`/clients/${client_body.client_id}`, client_body);
  } catch (err) {
    console.error('Something went wrong updating the OAuth client');
    console.error(err);
    process.exit(1);
  }
})();

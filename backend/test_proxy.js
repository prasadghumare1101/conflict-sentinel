require('dotenv').config();
const axios = require('axios');

async function testProxy() {
  console.log("Testing Gemini Proxy...");
  try {
    const response = await axios.post('http://localhost:3001/api/gemini-proxy', {
      systemPrompt: "You are a helpful assistant.",
      userPrompt: "Hello, are you working?"
    });
    console.log("Proxy Response:", response.data.text);
    console.log("SUCCESS: Proxy is working!");
  } catch (error) {
    console.error("ERROR: Proxy test failed.");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Message:", error.message);
    }
  }
}

testProxy();

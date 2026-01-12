/**
 * Pre-request Scripts for Postman
 * Copy these scripts to the Pre-request Script tab of respective requests
 */

// ============================================
// Download Request - Signature Generation
// ============================================
// Add this to: POST /api/v1/download

(function() {
    try {
        // Generate timestamp
        const timestamp = Math.floor(Date.now() / 1000);
        pm.environment.set("timestamp", timestamp.toString());
        
        // Parse request body
        let orderId = "";
        let email = "";
        
        try {
            const body = JSON.parse(pm.request.body.raw);
            // Handle both number and string order_id
            orderId = body.order_id !== undefined ? String(body.order_id) : "";
            email = body.email || "";
            
            console.log("Parsed orderId:", orderId);
            console.log("Parsed email:", email);
        } catch (e) {
            console.error("Error parsing JSON body:", e.message);
            // Fallback regex - handle both string and number order_id
            // Pattern: "order_id": 12345 or "order_id": "12345"
            const bodyMatch = pm.request.body.raw.match(/"order_id"\s*:\s*([^,}\]]+)/);
            if (bodyMatch) {
                orderId = bodyMatch[1].replace(/[\"']/g, "").trim();
            }
            
            const emailMatch = pm.request.body.raw.match(/"email"\s*:\s*"([^"]+)"/);
            if (emailMatch) {
                email = emailMatch[1];
            }
            
            console.log("Fallback parsed orderId:", orderId);
            console.log("Fallback parsed email:", email);
        }
        
        // Validate required fields
        if (!orderId || !email) {
            console.error("Missing orderId or email:", { orderId, email });
            throw new Error("order_id and email are required in request body");
        }
        
        // Get secret key from environment
        const secretKey = pm.environment.get("secret_key");
        
        if (!secretKey) {
            console.error("SECRET_KEY not set in environment variables");
            throw new Error("secret_key environment variable is not set");
        }
        
        // Generate signature: HMAC_SHA256(order_id + email + timestamp)
        // Use crypto-js library (available in Postman)
        const CryptoJS = require('crypto-js');
        const payload = String(orderId) + String(email) + String(timestamp);
        const signature = CryptoJS.HmacSHA256(payload, secretKey).toString(CryptoJS.enc.Hex);
        
        console.log("Payload for signature:", payload);
        console.log("Generated signature:", signature);
        console.log("Timestamp:", timestamp);
        
        // Set signature in environment
        pm.environment.set("download_signature", signature);
        
        // Remove existing headers first (if any) to avoid duplicates
        pm.request.headers.remove("x-signature");
        pm.request.headers.remove("x-timestamp");
        
        // Add/Update headers with actual values (not variables)
        pm.request.headers.upsert({
            key: "x-signature",
            value: signature
        });
        
        pm.request.headers.upsert({
            key: "x-timestamp",
            value: timestamp.toString()
        });
        
        console.log("Headers set successfully");
        console.log("x-signature:", signature);
        console.log("x-timestamp:", timestamp);
        
    } catch (error) {
        console.error("Error in pre-request script:", error.message);
        console.error("Stack:", error.stack);
        // Don't throw - let the request proceed so user can see the error
    }
})();

// ============================================
// Grant Access Request - Signature Generation (if needed)
// ============================================
// Add this to: POST /api/v1/grant-access (if signature is required)

(function() {
    // Generate timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Parse request body
    let orderId = "";
    let email = "";
    
    try {
        const body = JSON.parse(pm.request.body.raw);
        orderId = body.order_id || "";
        email = body.email || "";
    } catch (e) {
        console.error("Error parsing request body:", e);
        return;
    }
    
    // Get secret key from environment
    const secretKey = pm.environment.get("secret_key");
    
    if (!secretKey) {
        console.log("Note: SECRET_KEY not set. Signature generation skipped.");
        return;
    }
    
    // Generate signature using crypto-js (Postman compatible)
    const CryptoJS = require('crypto-js');
    const payload = String(orderId) + String(email) + String(timestamp);
    const signature = CryptoJS.HmacSHA256(payload, secretKey).toString(CryptoJS.enc.Hex);
    
    // Uncomment if grant-access requires signature
    // pm.request.headers.add({
    //     key: "x-signature",
    //     value: signature
    // });
    // 
    // pm.request.headers.add({
    //     key: "x-timestamp",
    //     value: timestamp.toString()
    // });
})();

// ============================================
// Test Scripts - Add to Tests tab
// ============================================

// Common test for successful response
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Test for JSON response
pm.test("Response is JSON", function () {
    pm.response.to.be.json;
});

// Test for success field in response
pm.test("Response has success field", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('success');
});

// Save order code from create-order response
if (pm.request.url.toString().includes('create-order')) {
    pm.test("Save order code", function () {
        const jsonData = pm.response.json();
        if (jsonData.orderCode) {
            pm.environment.set("last_order_code", jsonData.orderCode);
            console.log("Order code saved:", jsonData.orderCode);
        }
    });
}


export default async function handler(req, res) {
    if (req.method !== "POST") {
        logger.warn("Method not allowed: " + req.method);
        return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    try {
        const body = req.body || {};

        console.log("🔔 MIDTRANS NOTIFICATION RECEIVED");
        console.log(JSON.stringify(body, null, 2));

        const {
            order_id,
            transaction_id,
            transaction_status,
            status_code,
            gross_amount,
            signature_key,
            payment_type
        } = body;

        if (!order_id || !transaction_status) {
            console.log("Invalid Midtrans payload");
            return res.status(400).json({ ok: false, message: "Invalid Midtrans payload" });
        }

        let PaymentCode = "OTHERS";

        if (payment_type.includes("gopay")) PaymentCode = "GOPAY";
        else if (payment_type.includes("qris")) PaymentCode = "QRISOTHERS";
        else if (payment_type.includes("credit_card")) PaymentCode = "CC";
        else PaymentCode = payment_type.toUpperCase();

        console.log(`💳 PaymentCode: ${PaymentCode}`);

        const paidStatuses = ["capture", "settlement", "success"];

        if (paidStatuses.includes(transaction_status.toLowerCase())) {
            console.log("💰 Payment completed, calling do-payment-trans-id...");
            const payload = {
                orderCode: String(order_id),
                payment: String(PaymentCode),
                reference: String(transaction_id)
            }
            console.log("payload", payload);
            const resp = await fetch(`${process.env.NEXT_PUBLIC_URL_UAT}/smartqr/v1/order/do-payment?storeCode=MGI`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await resp.json().catch(() => null);
 
            console.log("➡️ do-payment-trans-id result: " + JSON.stringify(resp));

            if (resp.ok) {
                return res.status(200).json({
                    ok: true,
                    message: "Notification processed",
                    orderId: order_id,
                    transactionId: transaction_id,
                });
            } else {
                console.log("❌ Backend failed: " + JSON.stringify(result));
                return res.status(400).json({ ok: false, message: "Failed to complete do-payment", error: String(result) });
            }
        }
        
        return res.status(400).json({ ok: false, message: "Paid status was not completed", error: String(err) });
    } catch (err) {
        console.log("ERROR HANDLING MIDTRANS NOTIF: " + err);
        return res.status(500).json({ ok: false, message: "Internal server error", error: String(err) });
    }
}

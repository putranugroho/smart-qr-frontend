import crypto from "crypto";

export default async function handler(req, res) {
    if (req.method !== "POST") {
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
            return res.status(400).json({ ok: false, message: "Invalid Midtrans payload" });
        }

        const serverKey = process.env.MIDTRANS_SERVER_KEY;

        const expectedSignature = crypto
            .createHash("sha512")
            .update(order_id + status_code + gross_amount + serverKey)
            .digest("hex");

        if (expectedSignature !== signature_key) {
            console.error("❌ Invalid Midtrans signature!");
            return res.status(401).json({ ok: false, message: "Invalid signature key" });
        }

        console.log("✔️ Valid Midtrans signature")

        let PaymentCode = "OTHERS";

        if (payment_type.includes("gopay")) PaymentCode = "GOPAY";
        else if (payment_type.includes("qris")) PaymentCode = "QRISOTHERS";
        else if (payment_type.includes("credit_card")) PaymentCode = "CC";
        else PaymentCode = payment_type.toUpperCase();

        console.log("💳 PaymentCode:", PaymentCode);

        const paidStatuses = ["capture", "settlement", "success"];

        if (paidStatuses.includes(transaction_status.toLowerCase())) {
            console.log("💰 Payment completed, calling do-payment-trans-id...");

            const resp = await fetch(`${process.env.NEXT_PUBLIC_DOMAIN}/api/order/do-payment-trans-id`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transactionId: transaction_id,
                    payment: PaymentCode,
                    reference: order_id
                })
            });

            const result = await resp.json().catch(() => null);

            console.log("➡️ do-payment-trans-id result:", result);

            if (!resp.ok) {
                console.error("❌ Backend do-payment-trans-id failed:", result);
            }
        }

        return res.status(200).json({
            ok: true,
            message: "Notification processed",
            orderId: order_id,
            transactionId: transaction_id
        });

    } catch (err) {
        console.error("ERROR HANDLING MIDTRANS NOTIF:", err);
        return res.status(500).json({ ok: false, message: "Internal server error", error: String(err) });
    }
}

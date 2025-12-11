import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/OrderStatus.module.css'
import { getPayment } from '../lib/cart'
import { getUser } from '../lib/auth'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

// helper: calculate taxes for a single item (handles combo and normal)
// Uses taxAmount from payload when available to avoid rounding mismatch.
function calculateItemTaxes(it) {
  let base = 0
  let pb1 = 0
  let ppn = 0

  if (it && it.type === 'combo' && Array.isArray(it.combos)) {
    // iterate each combo block so we have cb.qty (combo-block multiplier)
    it.combos.forEach(cb => {
      const cbQty = Number(cb.qty || cb.Qty || 1)
      const products = Array.isArray(cb.products) ? cb.products : []

      products.forEach(p => {
        const pQty = Number(p.qty ?? p.Qty ?? 1)
        const basePrice = Number(p.price ?? p.Price ?? 0)
        const itemQty = Number(it.qty ?? 1)

        // line base = product price * product qty * combo block qty * item qty
        const lineBase = basePrice * pQty * cbQty * itemQty
        base += lineBase


        // taxes for product: prefer explicit taxAmount (may be per unit)
        if (Array.isArray(p.taxes)) {
          p.taxes.forEach(tx => {
            const provided = Number(tx.taxAmount ?? tx.TaxAmount ?? 0)
            if (provided && provided !== 0) {
              // if provided, assume it's per product unit (as in payload examples)
              const amt = provided * pQty * cbQty * itemQty
              if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += amt
              else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += amt
            } else {
              const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
              const taxAmt = Math.round(lineBase * (pct / 100))
              if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += taxAmt
              else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += taxAmt
            }
          })
        }

        // condiments under product
        if (Array.isArray(p.condiments)) {
          p.condiments.forEach(c => {
            const cQty = Number(c.qty ?? c.Qty ?? 1)
            const cPrice = Number(c.price ?? c.Price ?? 0)
            const cBase = cPrice * cQty * pQty * cbQty * itemQty
            base += cBase

            if (Array.isArray(c.taxes)) {
              c.taxes.forEach(tx => {
                const provided = Number(tx.taxAmount ?? tx.TaxAmount ?? 0)
                if (provided && provided !== 0) {
                  const amt = provided * pQty * cbQty * itemQty * cQty
                  if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += amt
                  else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += amt
                } else {
                  const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
                  const taxAmt = Math.round(cBase * (pct / 100))
                  if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += taxAmt
                  else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += taxAmt
                }
              })
            }
          })
        }
      })
    })
  } else {
    const qty = Number(it.qty ?? 1)

    // harga dasar yang dilaporkan di payload (bisa berupa detailPrice atau already-included)
    const reportedPrice = Number(it.price ?? it.detailMenu?.price ?? 0)

    // harga detail (apa yang ada di detailMenu) — fallback ke reportedPrice jika tidak ada
    const detailPrice = Number(it.detailMenu?.price ?? it.detailMenu?.Price ?? reportedPrice)

    // total condiment (sum harga * qty)
    const conds = Array.isArray(it.condiments) ? it.condiments : []
    const condTotal = conds.reduce((s, c) => s + (Number(c.price ?? c.Price ?? 0) * Number(c.qty ?? c.Qty ?? 1)), 0)
    const includeCondiments = !(reportedPrice === detailPrice + condTotal);

    // If reportedPrice already includes condTotal, use it directly; otherwise combine detailPrice + condTotal
    let unitBase = reportedPrice
    if (reportedPrice === detailPrice + condTotal) {
      // reported already includes condiments -> don't double-add later
      unitBase = reportedPrice
    } else if (reportedPrice === detailPrice) {
      // reported is detail only -> we'll add conds below
      unitBase = detailPrice
    } else if (reportedPrice === 0 && detailPrice > 0) {
      // safe fallback: use detailPrice
      unitBase = detailPrice
    } else {
      // last fallback: treat reported as the authoritative unit price
      unitBase = reportedPrice
    }

    base = unitBase * qty

    // Taxes on the item itself (prefer explicit taxAmount)
    if (Array.isArray(it.taxes) && it.taxes.length > 0) {
      it.taxes.forEach(tx => {
        const provided = Number(tx.taxAmount ?? tx.TaxAmount ?? 0)
        if (provided && provided !== 0) {
          if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += provided
          else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += provided
        } else {
          const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
          const taxAmt = Math.round((unitBase * qty) * (pct / 100))
          if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += taxAmt
          else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += taxAmt
        }
      })
    }

    // Add condiments only if they were NOT already included in reportedPrice
    if (includeCondiments) {
      // add conds base + their taxes
      conds.forEach(c => {
        const cQty = Number(c.qty ?? c.Qty ?? 1)
        const cPrice = Number(c.price ?? c.Price ?? 0)
        const cBase = cPrice * cQty * qty
        base += cBase

        if (Array.isArray(c.taxes)) {
          c.taxes.forEach(tx => {
            const provided = Number(tx.taxAmount ?? tx.TaxAmount ?? 0)
            if (provided && provided !== 0) {
              if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += provided
              else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += provided
            } else {
              const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
              const taxAmt = Math.round(cBase * (pct / 100))
              if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PB')) pb1 += taxAmt
              else if ((String(tx.taxName ?? tx.TaxName ?? '').toUpperCase()).includes('PPN')) ppn += taxAmt
            }
          })
        }
      })
    }
  }

  return { base: Math.round(base), pb1: Math.round(pb1), ppn: Math.round(ppn) }
}

export default function OrderStatus() {
  const router = useRouter()
  const { id } = router.query

  const [displayOrderId, setDisplayOrderId] = useState('')
  const [displayMtId, setDisplayMtId] = useState('')
  const [dataOrder, setDataOrder] = useState(null)
  const [remoteOrderRaw, setRemoteOrderRaw] = useState(null)
  const [remoteOrderPayload, setRemoteOrderPayload] = useState(null)
  const [user, setUser] = useState(null)
  const [table, setTable] = useState('')
  const [currentStep, setCurrentStep] = useState(3)
  const [showAllItems, setShowAllItems] = useState(false)
  const [showPaymentRedirectModal, setShowPaymentRedirectModal] = useState(false)
  const [paymentRedirectUrl, setPaymentRedirectUrl] = useState('')
  const popupShownRef = useRef(false)
  const pollOrderRef = useRef(null)
  const [paymentAccepted, setPaymentAccepted] = useState(false)
  const [orderFinish, setOrderFinish] = useState(false)
  const [clientPayment, setClientPayment] = useState({ items: [], paymentTotal: 0 })
  const [lastManualCheckAt, setLastManualCheckAt] = useState(null)
  const [checkingNow, setCheckingNow] = useState(false)
  const [urlLogo, setUrlLogo] = useState("");

  // load session midtrans/do_order_result + user (prefer do_order_result stored in session)
  useEffect(() => {
    try {
      const doOrderPayload = sessionStorage.getItem("do_order_payload");
      setRemoteOrderPayload(JSON.parse(doOrderPayload))

      const doOrderRaw = sessionStorage.getItem('do_order_result')
      if (doOrderRaw) {
        const parsed = JSON.parse(doOrderRaw)
        // Accept either shape: { data: {...} } or direct payload
        const d = parsed?.data ?? parsed
        if (d) {
          setDataOrder(d)
          setRemoteOrderRaw(parsed)
          // set display id (support displayOrderId or orderCode)
          const mt_id = d.DisplayOrderId

          if (mt_id) setDisplayMtId(String(mt_id))
        }

        if (d.Payment.toLowerCase().includes("gopay")) {
          setUrlLogo("/images/pay-gopay.png")
        } if (d.Payment.toLowerCase().includes("qris")) {
          setUrlLogo("/images/pay-qris.png")
        }
      }
    } catch (e) { /* ignore */ }

    try {
      const s = sessionStorage.getItem('midtrans_tx')
      if (s) setRemoteOrderRaw(prev => prev || JSON.parse(s))
    } catch (e) { }

    const dataUser = getUser?.() || null
    setUser(dataUser)
    if (dataUser && dataUser.orderType === 'DI') setTable(`Table ${dataUser.tableNumber} • Dine In`)
    else if (dataUser) setTable(`Table ${dataUser.tableNumber} • Take Away`)

    try {
      const p = getPayment?.() || {}
      setClientPayment({ items: p.cart || [], paymentTotal: p.paymentTotal || 0 })
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => {
    // 1) Try stored display id first
    try {
      const stored = sessionStorage.getItem('display_order_id') || sessionStorage.getItem('displayOrderId')
      if (stored) setDisplayOrderId(String(stored))
    } catch (e) { }

    // 2) If router already ready and route id present, use it as fallback (useful when opening direct link)
    if (router.isReady) {
      const routeId = String(id || '').trim()
      if (routeId && !displayOrderId) setDisplayOrderId(routeId)
    }

    // note: we intentionally DON'T return here; this effect runs on mount and whenever router.isReady/id changes
  }, [router.isReady, id])

  // Normalize dataOrder into items array (combo + menu) — supports do_order_result shape
  const itemsFromRemote = (function () {
    if (!dataOrder) return []
    const arr = []

    // Combos (do_order_result uses lowercase 'combos')
    const combos = dataOrder.combos ?? dataOrder.Combos ?? []
    if (Array.isArray(combos) && combos.length > 0) {
      combos.forEach(cb => {
        const productsRaw = Array.isArray(cb.products ?? cb.Products) ? (cb.products ?? cb.Products) : []
        // normalize product condiments and product fields
        const mappedProducts = productsRaw.map(p => ({
          code: p.code ?? p.Code ?? '',
          name: p.name ?? p.Name ?? '',
          price: Number(p.price ?? p.Price ?? 0),
          qty: Number(p.qty ?? p.Qty ?? 1),
          taxes: Array.isArray(p.taxes ?? p.Taxes) ? (p.taxes ?? p.Taxes) : [],
          // normalize condiments under product
          condiments: (Array.isArray(p.condiments ?? p.Condiments) ? (p.condiments ?? p.Condiments) : []).map(c => ({
            code: c.code ?? c.Code ?? '',
            name: c.name ?? c.Name ?? c.group ?? '',
            qty: Number(c.qty ?? c.Qty ?? 1),
            price: Number(c.price ?? c.Price ?? 0),
            taxes: Array.isArray(c.taxes ?? c.Taxes) ? (c.taxes ?? c.Taxes) : []
          }))
        }))

        // compute combo unit price (sum product prices * qty + condiments)
        const comboUnitPrice = mappedProducts.reduce((s, p) => {
          const prodBase = Number(p.price || 0) * Number(p.qty || 1)
          const condTotal = (Array.isArray(p.condiments) ? p.condiments.reduce((ss, c) => ss + (Number(c.price || 0) * Number(c.qty || 1)), 0) : 0)
          return s + prodBase + condTotal
        }, 0)

        // aggregate taxes for combo (sum taxAmount fields if present)
        const comboTaxes = []
        const taxCollector = {}
        mappedProducts.forEach(p => {
          (p.taxes || []).forEach(tx => {
            const name = (tx.taxName ?? tx.TaxName ?? '').toString() || 'UNKNOWN'
            const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
            const amt = Number(tx.taxAmount ?? tx.TaxAmount ?? 0)
            if (!taxCollector[name]) taxCollector[name] = { taxName: name, taxPercentage: pct, taxAmount: 0 }
            taxCollector[name].taxAmount += amt || Math.round((pct / 100) * (Number(p.price || 0) * Number(p.qty || 1)))
          })
        })
        Object.values(taxCollector).forEach(v => comboTaxes.push(v))

        arr.push({
          type: 'combo',
          combos: [{
            detailCombo: {
              code: cb.detailCombo?.code ?? cb.DetailCombo?.Code ?? '',
              name: cb.detailCombo?.name ?? cb.DetailCombo?.Name ?? '',
              image: cb.detailCombo?.image ?? cb.DetailCombo?.Image ?? null
            },
            isFromMacro: !!cb.isFromMacro ?? !!cb.IsFromMacro,
            orderType: cb.orderType ?? cb.OrderType ?? '',
            products: mappedProducts,
            qty: cb.qty ?? cb.Qty ?? 1,
            voucherCode: cb.voucherCode ?? cb.VoucherCode ?? null
          }],
          qty: cb.qty ?? cb.Qty ?? 1,
          // set item-level price = unit price of combo (without rounding/qty)
          price: Number(comboUnitPrice),
          detailCombo: {
            code: cb.detailCombo?.code ?? cb.DetailCombo?.Code ?? '',
            name: cb.detailCombo?.name ?? cb.DetailCombo?.Name ?? '',
            image: cb.detailCombo?.image ?? cb.DetailCombo?.Image ?? null
          },
          note: cb.note ?? cb.Note ?? '',
          image: cb.image ?? cb.Image ?? null,
          taxes: comboTaxes
        })
      })
    }

    // Menus
    const menus = dataOrder.menus ?? dataOrder.Menus ?? []

    if (Array.isArray(menus) && menus.length > 0) {
      menus.forEach(m => {

        // normalize condiments
        const rawConds = Array.isArray(m.condiments ?? m.Condiments)
          ? (m.condiments ?? m.Condiments)
          : []

        const conds = rawConds.map(c => ({
          code: c.code ?? c.Code ?? "",
          name: c.name ?? c.Name ?? c.itemName ?? c.ItemName ?? c.group ?? c.Group ?? "",
          qty: Number(c.qty ?? c.Qty ?? 1),
          price: Number(c.price ?? c.Price ?? 0),
          taxes: Array.isArray(c.taxes ?? c.Taxes) ? (c.taxes ?? c.Taxes) : []
        }))

        const detailMenu = m.detailMenu ?? m.DetailMenu ?? {}

        const detailPrice = Number(detailMenu.price ?? detailMenu.Price ?? 0)
        const finalPrice = Number(m.price ?? detailPrice)

        arr.push({
          type: "menu",

          // final price
          price: finalPrice,

          qty: Number(m.qty ?? m.Qty ?? 1),

          // FIXED NAME & TITLE
          title: detailMenu.itemName ?? detailMenu.ItemName ?? detailMenu.name ?? detailMenu.Name ?? "",
          name: detailMenu.name ?? detailMenu.Name ?? detailMenu.itemName ?? detailMenu.ItemName ?? "",

          // FIXED CODE
          code: detailMenu.Code ?? "",

          // FIXED IMAGE
          image: detailMenu.Image ?? detailMenu.image ?? m.image ?? null,

          // FIXED ORDER TYPE
          orderType: m.orderType ?? m.OrderType ?? "",

          condiments: conds,
          taxes: Array.isArray(m.taxes ?? m.Taxes) ? (m.taxes ?? m.Taxes) : [],
          note: m.note ?? m.Note ?? ""
        })
      })
    }

    return arr
  })()

  const items = itemsFromRemote.length > 0 ? itemsFromRemote : (clientPayment.items || [])
  const itemsCount = items.length

  // compute totals using calculateItemTaxes but prefer dataOrder.taxes (payload totals) when available
  let computedSubtotal = 0
  let computedPB1 = 0
  let computedPPN = 0

  items.forEach((it) => {
    const t = calculateItemTaxes(it)

    computedSubtotal += t.base
    computedPB1 += t.pb1
    computedPPN += t.ppn
  })

  computedSubtotal = Math.round(computedSubtotal)
  computedPB1 = Math.round(computedPB1)
  computedPPN = Math.round(computedPPN)

  // If dataOrder contains top-level taxes (do_order_result), prefer those exact amounts
  if (dataOrder && Array.isArray(dataOrder.taxes) && dataOrder.taxes.length > 0) {
    const topTaxes = dataOrder.taxes.reduce((acc, tx) => {
      const name = (tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase()
      const amt = Number(tx.taxAmount ?? tx.TaxAmount ?? 0)
      if (name.includes('PB')) acc.pb1 += amt
      else if (name.includes('PPN')) acc.ppn += amt
      return acc
    }, { pb1: 0, ppn: 0 })

    if (topTaxes.pb1 || topTaxes.ppn) {
      computedPB1 = Math.round(topTaxes.pb1)
      computedPPN = Math.round(topTaxes.ppn)
    }
  }

  const unroundedTotal = computedSubtotal + computedPB1 + computedPPN

  // Rounding rules: if subtotal < 50 -> rounding 0 (per request)
  let roundingAmount = 0
  if (computedSubtotal < 50) {
    roundingAmount = 0
  } else {
    const roundedTotal = Math.round(unroundedTotal / 100) * 100
    roundingAmount = roundedTotal - unroundedTotal
  }

  const total = unroundedTotal + roundingAmount

  function handleToggleShowAll() {
    setShowAllItems(prev => !prev)
  }

  // helper: parse order_id from paymentLink (try decode percent-encoding)
  function parseOrderIdFromPaymentLink(link) {
    if (!link) return null
    try {
      const decoded = decodeURIComponent(link)
      const m = decoded.match(/[?&]order_id=([^&]+)/i) || decoded.match(/[?&]orderId=([^&]+)/i) || decoded.match(/order_id%3D([^&]+)/i)
      if (m && m[1]) return decodeURIComponent(m[1])
    } catch (e) { /* ignore */ }
    return null
  }

  // Improved fetch with timeout and logs. This is the place we use to call backend "check-status".
  async function fetchRemoteOrder(orderCodeToFetch) {
    if (!orderCodeToFetch) return null
    try {
      // --- DEFAULT: use proxy route (keamanan / CORS)
      const url = `/api/order/check-status?orderCode=${encodeURIComponent(orderCodeToFetch)}`

      // --- TIMEOUT helper
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const r = await fetch(url, { signal: controller.signal, method: 'GET', headers: { 'Accept': 'application/json' } })
      clearTimeout(timeout)
      if (!r.ok) {
        console.warn('[OrderStatus] fetchRemoteOrder HTTP', r.status)
        return null
      }
      const j = await r.json().catch(() => null)
      return j
    } catch (e) {
      if (e && e.name === 'AbortError') {
        console.warn('[OrderStatus] fetchRemoteOrder timed out')
      } else {
        console.warn('[OrderStatus] fetchRemoteOrder failed', e)
      }
      return null
    }
  }

  // Polling remote order API (start when id available or when do_order_result exists)
  useEffect(() => {
    if (!router.isReady) return
    if (pollOrderRef?.current) {
      clearInterval(pollOrderRef.current);
      pollOrderRef.current = null;
    }

    let orderCodeToPoll = String(id || '').trim()
    if (!orderCodeToPoll) {
      try {
        const stored = sessionStorage.getItem('do_order_result')
        if (stored) {
          const parsed = JSON.parse(stored)
          orderCodeToPoll = parsed?.data?.orderCode ?? parsed?.orderCode ?? ''
        }
      } catch (e) { /* ignore */ }
    }

    if (!orderCodeToPoll) {
      return
    }

    try { sessionStorage.setItem('current_order_code', orderCodeToPoll) } catch (e) { }

    let mounted = true

    async function checkOrder() {
      try {
        const apiResp = await fetchRemoteOrder(orderCodeToPoll)
        if (!apiResp) return
        console.log("API RESP : ", apiResp)
        if (!mounted) return
        console.log("API MOUNTED : ", mounted)

        // FIX: Cek apakah data ada di dalam properti .data ATAU langsung di root object
        const realData = apiResp.data || apiResp

        console.log("realData : ", realData)

        // Validasi sederhana: pastikan ada Combos atau Menus atau Status
        if (!realData.combos && !realData.menus && realData.status === undefined) {
          return
        }


        setRemoteOrderRaw(apiResp)
        setDataOrder(realData) // Gunakan realData yang sudah dipastikan isinya
        try { sessionStorage.setItem('do_order_result', JSON.stringify(apiResp)) } catch (e) { }
        try { localStorage.setItem('do_order_result', JSON.stringify(apiResp)) } catch (e) { }

        const oc = realData.orderCode ?? realData.OrderCode ?? null // Sesuaikan casing
        if (oc) setDisplayOrderId(String(oc))

        const statusNum = Number(realData.Status ?? realData.status ?? 0)

        if (statusNum === -1) {
          setCurrentStep(4)

          const paymentLinkFromApi = (apiResp.data.PaymentLink ?? apiResp.data.paymentLink ?? apiResp.data.PaymentUrl ?? '') || ''
          const displayOrderIdFromApi = apiResp.data.DisplayOrderId ?? apiResp.data.displayOrderId ?? null
          const foundDisplayOrderId = displayOrderIdFromApi || parseOrderIdFromPaymentLink(paymentLinkFromApi) || sessionStorage.getItem('display_order_id')

          if (foundDisplayOrderId) {
            try {
              const stResp = await fetch(`/api/midtrans/status?orderId=${encodeURIComponent(foundDisplayOrderId)}`, {
                cache: "no-store"
              })
              if (stResp.ok) {
                const stj = await stResp.json()
                const txStatus = (stj.transaction_status || stj.status || '')
                  .toString()
                  .trim()
                  .toLowerCase();
                console.log("TX STATUS:", { stj, txStatus })
           
                if (!['capture', 'settlement', 'success'].includes(txStatus)) {
                  const popupKey = `payment_redirect_shown:${orderCodeToPoll}`
                  const already = sessionStorage.getItem(popupKey)
                  if (!already && !popupShownRef.current) {
                    popupShownRef.current = true
                    try { sessionStorage.setItem(popupKey, '1') } catch (e) { }
                    setPaymentRedirectUrl(paymentLinkFromApi || sessionStorage.getItem('payment_link_for_order') || '')
                    setShowPaymentRedirectModal(true)
                  }
                } else {
                  setCurrentStep(2)
                  setPaymentAccepted(true)
                }
              }
            } catch (e) {
              console.warn('midtrans status check failed inside order polling', e)
            }
          } else {
            const paymentLinkExists = paymentLinkFromApi || sessionStorage.getItem('payment_link_for_order') || ''
            if (paymentLinkExists) {
              const popupKey = `payment_redirect_shown:${orderCodeToPoll}`
              const already = sessionStorage.getItem(popupKey)
              if (!already && !popupShownRef.current) {
                popupShownRef.current = true
                try { sessionStorage.setItem(popupKey, '1') } catch (e) { }
                setPaymentRedirectUrl(paymentLinkExists)
                setShowPaymentRedirectModal(true)
              }
            }
          }
        } else if (statusNum === 0) {
          setCurrentStep(2)
          setPaymentAccepted(true)
        } else if (statusNum > 0 || statusNum === 3) {
          setCurrentStep(1)
          setPaymentAccepted(true)
          setOrderFinish(true)
        }

      if (realData?.payment?.toLowerCase()?.includes("gopay")) {
        setUrlLogo("/images/pay-gopay.png")
      } else if (realData?.payment?.toLowerCase()?.includes("qris")) {
        setUrlLogo("/images/pay-qris.png")
      }
      } catch (err) {
        console.warn('checkOrder error', err)
      }
    }

    // initial check & interval
    checkOrder()
    pollOrderRef.current = setInterval(checkOrder, 5000)

    return () => {
      mounted = false
      if (pollOrderRef.current) {
        clearInterval(pollOrderRef.current)
        pollOrderRef.current = null
      }
    }
  }, [router.isReady, id])

  const baseSteps = [
    { key: 1, title: 'Pesanan Selesai', desc: 'Pesanan sudah selesai', img: '/images/check-icon.png' },
    { key: 2, title: 'Makanan Sudah Siap', desc: 'Pesanan kamu akan segera diantar', img: '/images/bowl-icon.png' },
    { key: 3, title: 'Pembayaran Berhasil', desc: 'Pembayaran kamu sudah diterima', img: '/images/wallet-icon.png' },
    { key: 4, title: 'Pesanan Dibuat', desc: 'Pesanan kamu sudah masuk', img: '/images/mobile-icon.png' },
  ]

  const steps = baseSteps.map(s => {
    if (s.key === 3 && !paymentAccepted) {
      return { ...s, title: 'Pembayaran Pending', desc: 'Silahkan selesesaikan pembayaran kamu' }
    }
    if (s.key === 2 && !orderFinish) {
      return { ...s, title: 'Makanan Sedang Disiapkan', desc: 'Pesanan kamu sedang disiapkan' }
    }
    return s
  })


  const visibleItems = showAllItems ? items : (itemsCount > 0 ? [items[0]] : [])
  console.log("visibleItems", visibleItems);

  const computeItemTotal = (item) => {
    const qty = Number(item.qty || 1);
    let base = Number(item.price || 0);
    let addonTotal = 0;

    // Kondimen (MENU)
    if (item.condiments?.length) {
      addonTotal += item.condiments.reduce(
        (sum, c) => sum + Number(c.price || 0),
        0
      );
    }

    // ADD ON untuk COMBO (masuk dari products)
    if (item.type === 'combo') {
      const products = item.combos?.[0]?.products || [];
      addonTotal += products.reduce(
        (sum, p) => sum + Number(p.price || 0),
        0
      );
    }

    return (base + addonTotal) * qty;
  };

  const MERCHANT_PHONE = '+628123456789'
  async function contactMerchant() {
    try { if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') await navigator.clipboard.writeText(MERCHANT_PHONE) } catch (e) { }
    const normalized = MERCHANT_PHONE.replace(/\D/g, '')
    if (normalized) {
      const waUrl = `https://wa.me/${normalized}`
      window.open(waUrl, '_blank', 'noopener')
      alert(`Nomor kontak disalin ke clipboard: ${MERCHANT_PHONE}\nMembuka WhatsApp...`)
    } else {
      alert(`Hubungi merchant: ${MERCHANT_PHONE}`)
    }
  }

  function onModalCancel() { setShowPaymentRedirectModal(false) }
  function onModalProceed() {
    setShowPaymentRedirectModal(false)
    if (paymentRedirectUrl) {
      try { sessionStorage.setItem(`payment_redirect_attempted:${displayOrderId || id}`, '1') } catch (e) { }
      window.location.href = paymentRedirectUrl
    } else {
      alert('Tautan pembayaran tidak tersedia.')
    }
  }

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/')}>&larr;</button>
        <div className={styles.headerTitle}>Detail Pesanan</div>
      </header>

      {/* BLUE BOX */}
      <div className={styles.blueBox}>
        <div className={styles.blueLeft}>
          <div className={styles.orderType}>
            <Image src="/images/bell-icon.png" alt="Bell" width={20} height={20} style={{ paddingRight: 5 }} />
            {table}
          </div>
          <div className={styles.storeName}>Yoshinoya - Mall Grand Indonesia</div>
        </div>

        <div className={styles.orderNumberBox}>
          <div className={styles.smallText}>Nomor Order</div>
          <div className={styles.orderNumber}>{String(displayOrderId || '-')}</div>
        </div>
      </div>

      {/* TRACK ORDER */}
      <div className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        </div>

        <div className={styles.trackLineWrap}>
          <div className={styles.trackLine}></div>

          <div className={styles.stepsWrap}>
            {steps.map((s) => {
              const status = (currentStep === 1 ? 'done' : (s.key > currentStep ? 'done' : (s.key === currentStep ? 'ongoing' : 'upcoming')))
              return (
                <div key={s.key} className={`${styles.stepItem} ${styles[status]}`}>
                  <div className={styles.iconCircle} aria-hidden>
                    <Image src={s.img} alt={s.title} width={24} height={24} />
                  </div>

                  <div className={styles.stepTextWrap}>
                    <div className={styles.stepTitle}>{s.title}</div>
                    <div className={styles.stepDesc}>{s.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ORDERED ITEMS */}
      <div className={styles.sectionPayment}>
        <div className={styles.itemsTitle}>Ordered Items ({itemsCount})</div>
        <div className={styles.trackLine}></div>

        {/* Grouping items berdasarkan orderType */}
        {(() => {
          const groups = visibleItems.reduce((acc, it) => {
            const type = it.orderType || it.combos?.[0]?.orderType || it.menus?.[0]?.orderType || 'UNKNOWN';
            if (!acc[type]) acc[type] = [];
            acc[type].push(it);
            return acc;
          }, {});

          const orderedTypes = ['DI', 'TA']; // urutan tampil

          return (
            <div className={styles.itemsList}>

              {visibleItems.length === 0 && (
                <div className={styles.noItems}>Belum ada item dipesan.</div>
              )}

              {/* Render DI lalu TA */}
              {orderedTypes.map((ot) =>
                groups[ot] ? (
                  <div key={ot} className={styles.groupBlock}>

                    {/* Title per kelompok */}
                    <div className={styles.groupTitle}>
                      {ot === 'DI' ? 'Dine In' : 'Take Away'}
                    </div>

                    {/* List item di dalam kelompok */}
                    {groups[ot].map((it, i) => (
                      <div key={i} className={styles.itemRow}>
                        <div className={styles.itemImageWrap}>
                          <Image
                            src={it.detailCombo?.image ?? it.image ?? '/images/no-image-available.jpg'}
                            alt={it.detailCombo?.name ?? it.title ?? it.name ?? 'item'}
                            width={64}
                            height={64}
                            className={styles.itemImage}
                          />
                        </div>

                        <div className={styles.itemInfo}>
                          <div className={styles.itemTitle}>
                            {it.detailCombo?.name ?? it.title ?? it.name}
                          </div>

                          <div className={styles.itemAddon}>
                            {it.type === 'combo' ? (
                              <>
                                {it.qty || 1}x •{' '}
                                {it.combos?.[0]?.products
                                  ?.map(p => p.name)
                                  .filter(Boolean)
                                  .join(' + ') || 'Combo'}
                              </>
                            ) : (
                              <>
                                {(it.qty || 1)}x{' '}
                                {it.condiments && it.condiments.length
                                  ? it.condiments.map(c =>
                                    c.name || c.group || c.code
                                  ).join(', ')
                                  : it.note || 'No Add On'}
                              </>
                            )}
                          </div>
                        </div>

                        <div className={styles.itemPrice}>
                          {formatRp(computeItemTotal(it))}
                        </div>
                      </div>
                    ))}

                  </div>
                ) : null
              )}

            </div>
          );
        })()}

        {itemsCount > 1 && (
          <button
            className={styles.viewAllBtn}
            onClick={handleToggleShowAll}
            type="button"
            aria-expanded={showAllItems}
          >
            <span className={styles.viewAllText}>
              {showAllItems ? 'Lebih Sedikit' : 'Lihat Semua'}
            </span>
          </button>
        )}
      </div>

      {/* PAYMENT METHOD & DETAILS (unchanged) */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Pilih Metode Pembayaran</div>

        <div className={styles.paymentBox}>
          <div className={styles.paymentBoxHeader}>
            <div className={styles.paymentBoxTitle}>Pembayaran Online</div>

            <Image src="/images/pembayaran-online.png" alt="pembayaran online" width={50} height={50} className={styles.paymentBoxIcon} />
          </div>
        </div>

        <div className={styles.paymentItem}>
          <div className={styles.paymentItemLeft}>
            <img src={urlLogo} alt="logo" width={55} height={14} className={styles.iconImg} />
          </div>
          <div className={styles.paymentItemRight}>
            <div className={styles.orderNumber}>{displayMtId ? displayMtId : ""}</div>
          </div>
        </div>
      </div>

      {/* PAYMENT DETAIL */}
      <div className={styles.paymentSection}>
        <div className={styles.paymentTitle}>Detail Pembayaran</div>

        <div className={styles.paymentRow}>
          <div>Subtotal ({itemsCount} menu)</div>
          <div className={styles.paymentValue}>{formatRp(computedSubtotal)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>PB1 (10%)</div>
          <div className={styles.paymentValue}>{formatRp(computedPB1)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>PPN (11%)</div>
          <div className={styles.paymentValue}>{formatRp(computedPPN)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>Rounding</div>
          <div className={styles.paymentValue}>{formatRp(roundingAmount)}</div>
        </div>

        <div className={styles.paymentTotalRow}>
          <div>Total</div>
          <div className={styles.paymentTotalValue}>{formatRp(total)}</div>
        </div>
      </div>

      {/* Hoverbar */}
      <div className={styles.hoverBarWrap} role="region" aria-label="Aksi pesanan">
        <div className={styles.hoverBar}>
          <button className={styles.btnDownload} onClick={() => router.push(`/bill/${displayOrderId || id}`)} aria-label="Download bill" type="button">
            <span>Download Bill</span>
          </button>

          {/* <button className={styles.btnContact} onClick={contactMerchant} aria-label="Kontak merchant" type="button">
            <span>Kontak</span>
          </button> */}
        </div>
      </div>

      {/* Payment redirect modal (appears 1x) */}
      {showPaymentRedirectModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Pembayaran belum selesai</h3>
            <p>Sepertinya pembayaran belum selesai. Lanjutkan pembayaran sekarang?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                className={styles.btnSecondary}
                onClick={onModalCancel}
                style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', color: '#b91c1c' }}
              >
                Batal
              </button>
              <button
                className={styles.btnPrimary}
                onClick={onModalProceed}
                style={{ background: '#16a34a', color: '#fff' }}
              >
                Lanjutkan Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 72 }} />
    </div>
  )
}
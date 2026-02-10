/* ========================================================
   EasyEcon — App Logic
   ======================================================== */

// ─── TAB NAVIGATION ───────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

        // Re-setup canvases in the newly visible tab and redraw
        const tab = btn.dataset.tab;
        if (tab === 'graph') {
            setupHiDPICanvas(document.getElementById('mainCanvas'));
            updateMainGraph();
        } else if (tab === 'elasticity') {
            ['pedCanvas','pesCanvas','iedCanvas','cedCanvas'].forEach(id => {
                const c = document.getElementById(id);
                if (c) setupHiDPICanvas(c);
            });
            drawElasticityGraphs();
        } else if (tab === 'goods') {
            document.querySelectorAll('.good-canvas').forEach(c => setupHiDPICanvas(c));
            drawGoodTypeGraphs();
        }
    });
});

// Sub-tabs (elasticity)
document.querySelectorAll('.sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sub-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('sub-' + btn.dataset.sub).classList.add('active');
        // Re-setup the canvas in the newly visible sub-tab
        ['pedCanvas','pesCanvas','iedCanvas','cedCanvas'].forEach(id => {
            const c = document.getElementById(id);
            if (c) setupHiDPICanvas(c);
        });
        drawElasticityGraphs();
    });
});

// ─── UTILITY ──────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ─── RETINA / HiDPI CANVAS FIX ───────────────────────────
// Save the HTML-attribute dimensions BEFORE the first overwrite,
// so canvases inside hidden tabs (display:none) still get correct sizes.
function setupHiDPICanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    // On first call, save intended dimensions from HTML attributes
    if (!canvas._intendedWidth) {
        canvas._intendedWidth = canvas.width || 440;
        canvas._intendedHeight = canvas.height || 380;
    }
    let logW = canvas._intendedWidth;
    let logH = canvas._intendedHeight;

    // Responsive: if the parent container is narrower, scale canvas down
    const parent = canvas.parentElement;
    if (parent) {
        const availW = parent.clientWidth - 16; // 16px breathing room
        if (availW > 0 && availW < logW) {
            const scale = availW / logW;
            logW = Math.round(availW);
            logH = Math.round(canvas._intendedHeight * scale);
        }
    }

    canvas.width = logW * dpr;
    canvas.height = logH * dpr;
    canvas.style.width = logW + 'px';
    canvas.style.height = logH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    canvas._logicalWidth = logW;
    canvas._logicalHeight = logH;
    return ctx;
}

function getLogicalSize(canvas) {
    return {
        width: canvas._logicalWidth || canvas._intendedWidth || 440,
        height: canvas._logicalHeight || canvas._intendedHeight || 380
    };
}

// Set up all canvases on load and resize
function setupAllCanvases() {
    ['mainCanvas', 'pedCanvas', 'pesCanvas', 'iedCanvas', 'cedCanvas'].forEach(id => {
        const c = document.getElementById(id);
        if (c) setupHiDPICanvas(c);
    });
    // Good-type mini canvases
    document.querySelectorAll('.good-canvas').forEach(c => setupHiDPICanvas(c));
}
setupAllCanvases();
window.addEventListener('resize', () => {
    setupAllCanvases();
    updateMainGraph();
    drawElasticityGraphs();
    drawGoodTypeGraphs();
});

// ─── GRAPH ENGINE ─────────────────────────────────────────
// Demand: P = demandIntercept - demandSlope * Q
// Supply: P = supplyIntercept + supplySlope * Q
// Equilibrium: Q* = (dI - sI) / (dS + sS),  P* = dI - dS * Q*

const GRAPH = {
    // Base parameters
    baseDemandIntercept: 10,
    baseDemandSlope: 1,
    baseSupplyIntercept: 1,
    baseSupplySlope: 1,

    // Current (modified by sliders)
    demandIntercept: 10,
    demandSlope: 1,
    supplyIntercept: 1,
    supplySlope: 1,

    // Price controls
    floorEnabled: false,
    ceilingEnabled: false,
    floorPrice: 6,
    ceilingPrice: 3,

    // Display
    showSurplus: true,
    showLabels: true,
    showGrid: true,

    // Canvas mapping
    maxP: 12,
    maxQ: 12,
    padding: { top: 30, right: 30, bottom: 50, left: 55 },
};

function getEquilibrium(dI, dS, sI, sS) {
    if (dS + sS === 0) return null;
    const q = (dI - sI) / (dS + sS);
    const p = dI - dS * q;
    if (q < 0 || p < 0) return null;
    return { q, p };
}

function mapToCanvas(q, p, canvas, pad, maxQ, maxP) {
    const { width, height } = getLogicalSize(canvas);
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;
    return {
        x: pad.left + (q / maxQ) * w,
        y: pad.top + (1 - p / maxP) * h
    };
}

function qFromP_demand(p, dI, dS) { return dS === 0 ? 0 : (dI - p) / dS; }
function qFromP_supply(p, sI, sS) { return sS === 0 ? 0 : (p - sI) / sS; }
function pFromQ_demand(q, dI, dS) { return dI - dS * q; }
function pFromQ_supply(q, sI, sS) { return sI + sS * q; }

// ─── DRAW MAIN GRAPH ─────────────────────────────────────
function drawGraph(canvasId, g, eqInfoId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = g.padding || GRAPH.padding;
    const maxQ = g.maxQ || GRAPH.maxQ;
    const maxP = g.maxP || GRAPH.maxP;
    const { width: W, height: H } = getLogicalSize(canvas);
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    // Helper
    function m(q, p) { return mapToCanvas(q, p, canvas, pad, maxQ, maxP); }

    // ─ Grid ─
    if (g.showGrid !== false) {
        ctx.strokeStyle = '#e8e8ee';
        ctx.lineWidth = 0.7;
        for (let i = 0; i <= maxQ; i += 2) {
            const { x } = m(i, 0);
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
        }
        for (let i = 0; i <= maxP; i += 2) {
            const { y } = m(0, i);
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
        }
    }

    // ─ Axes ─
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#555';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Quantity (Q)', pad.left + plotW / 2, H - 8);
    ctx.save();
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Price (P)', 0, 0);
    ctx.restore();

    // Tick labels
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    for (let i = 0; i <= maxQ; i += 2) {
        const { x, y } = m(i, 0);
        ctx.fillText(i, x, y + 16);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= maxP; i += 2) {
        const { x, y } = m(0, i);
        ctx.fillText(i, pad.left - 8, y + 4);
    }

    const dI = g.demandIntercept;
    const dS = g.demandSlope;
    const sI = g.supplyIntercept;
    const sS = g.supplySlope;

    // Equilibrium
    const eq = getEquilibrium(dI, dS, sI, sS);

    // ─ Consumer Surplus ─
    if (eq && (g.showSurplus !== false)) {
        const pEq = m(0, eq.p);
        const pMax = m(0, Math.min(dI, maxP));
        const eqPt = m(eq.q, eq.p);
        ctx.fillStyle = 'rgba(255, 209, 102, 0.22)';
        ctx.beginPath();
        ctx.moveTo(pMax.x, pMax.y);
        ctx.lineTo(eqPt.x, eqPt.y);
        ctx.lineTo(pEq.x, eqPt.y);
        ctx.closePath();
        ctx.fill();
    }

    // ─ Price Floor (shading + dashed line, drawn BEFORE curves) ─
    if (g.floorEnabled && g.floorPrice != null) {
        const fp = g.floorPrice;
        const fy = m(0, fp).y;
        if (eq && fp > eq.p) {
            const qd_floor = Math.max(0, qFromP_demand(fp, dI, dS));
            const qs_floor = Math.max(0, qFromP_supply(fp, sI, sS));
            if (qs_floor > qd_floor) {
                ctx.fillStyle = 'rgba(230, 57, 70, 0.10)';
                const p1 = m(qd_floor, fp);
                const p2 = m(qs_floor, fp);
                ctx.fillRect(p1.x, fy - 15, p2.x - p1.x, 30);
            }
        }
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#e63946';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pad.left, fy); ctx.lineTo(pad.left + plotW, fy); ctx.stroke();
        ctx.setLineDash([]);
    }

    // ─ Price Ceiling (shading + dashed line, drawn BEFORE curves) ─
    if (g.ceilingEnabled && g.ceilingPrice != null) {
        const cp = g.ceilingPrice;
        const cy = m(0, cp).y;
        if (eq && cp < eq.p) {
            const qd_ceil = Math.max(0, qFromP_demand(cp, dI, dS));
            const qs_ceil = Math.max(0, qFromP_supply(cp, sI, sS));
            if (qd_ceil > qs_ceil) {
                ctx.fillStyle = 'rgba(69, 123, 157, 0.10)';
                const p1 = m(qs_ceil, cp);
                const p2 = m(qd_ceil, cp);
                ctx.fillRect(p1.x, cy - 15, p2.x - p1.x, 30);
            }
        }
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#457b9d';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pad.left, cy); ctx.lineTo(pad.left + plotW, cy); ctx.stroke();
        ctx.setLineDash([]);
    }

    // ─ Demand curve (on top of floor/ceiling) ─
    ctx.strokeStyle = '#ef476f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (let q = 0; q <= maxQ; q += 0.1) {
        const p = pFromQ_demand(q, dI, dS);
        if (p < 0 || p > maxP) { started = false; continue; }
        const pt = m(q, p);
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // ─ Supply curve (on top of floor/ceiling) ─
    ctx.strokeStyle = '#06d6a0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    started = false;
    for (let q = 0; q <= maxQ; q += 0.1) {
        const p = pFromQ_supply(q, sI, sS);
        if (p < 0 || p > maxP) { started = false; continue; }
        const pt = m(q, p);
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // ─ Floor/Ceiling labels (on top of curves) ─
    if (g.floorEnabled && g.floorPrice != null) {
        const fp = g.floorPrice;
        const fy = m(0, fp).y;
        if (eq && fp > eq.p) {
            const qd_floor = Math.max(0, qFromP_demand(fp, dI, dS));
            const qs_floor = Math.max(0, qFromP_supply(fp, sI, sS));
            if (qs_floor > qd_floor) {
                ctx.fillStyle = '#e63946';
                ctx.font = 'bold 11px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText('SURPLUS', (m(qd_floor, fp).x + m(qs_floor, fp).x) / 2, fy - 20);
            }
        }
        ctx.fillStyle = '#e63946';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('Price Floor', pad.left + plotW - 70, fy - 6);
    }
    if (g.ceilingEnabled && g.ceilingPrice != null) {
        const cp = g.ceilingPrice;
        const cy = m(0, cp).y;
        if (eq && cp < eq.p) {
            const qd_ceil = Math.max(0, qFromP_demand(cp, dI, dS));
            const qs_ceil = Math.max(0, qFromP_supply(cp, sI, sS));
            if (qd_ceil > qs_ceil) {
                ctx.fillStyle = '#457b9d';
                ctx.font = 'bold 11px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText('SHORTAGE', (m(qs_ceil, cp).x + m(qd_ceil, cp).x) / 2, cy + 28);
            }
        }
        ctx.fillStyle = '#457b9d';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('Price Ceiling', pad.left + plotW - 80, cy + 16);
    }

    // ─ Curve labels ─
    if (g.showLabels !== false) {
        ctx.font = 'bold 13px system-ui';
        // Demand label
        const dLabelQ = Math.min(maxQ - 1, qFromP_demand(1, dI, dS));
        if (dLabelQ > 0) {
            const dLbl = m(dLabelQ, pFromQ_demand(dLabelQ, dI, dS));
            ctx.fillStyle = '#ef476f';
            ctx.textAlign = 'left';
            ctx.fillText('D', dLbl.x + 6, dLbl.y - 6);
        }
        // Supply label
        const sLabelQ = Math.min(maxQ - 1, qFromP_supply(maxP - 1, sI, sS));
        if (sLabelQ > 0) {
            const sLbl = m(sLabelQ, pFromQ_supply(sLabelQ, sI, sS));
            ctx.fillStyle = '#06d6a0';
            ctx.textAlign = 'left';
            ctx.fillText('S', sLbl.x + 6, sLbl.y - 6);
        }
    }

    // ─ Equilibrium point ─
    if (eq && eq.q >= 0 && eq.q <= maxQ && eq.p >= 0 && eq.p <= maxP) {
        const eqPt = m(eq.q, eq.p);

        // Dashed lines to axes
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(eqPt.x, eqPt.y);
        ctx.lineTo(pad.left, eqPt.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(eqPt.x, eqPt.y);
        ctx.lineTo(eqPt.x, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Equilibrium dot
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(eqPt.x, eqPt.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Axis markers
        ctx.fillStyle = '#c49000';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'right';
        ctx.fillText('P*=' + eq.p.toFixed(1), pad.left - 4, eqPt.y - 6);
        ctx.textAlign = 'center';
        ctx.fillText('Q*=' + eq.q.toFixed(1), eqPt.x, pad.top + plotH + 28);
    }

    // Update info badge
    if (eqInfoId) {
        const priceEl = document.getElementById(eqInfoId.replace('info', 'price'));
        const qtyEl = document.getElementById(eqInfoId.replace('info', 'qty'));
        if (priceEl && qtyEl && eq) {
            priceEl.textContent = 'P = ' + eq.p.toFixed(2);
            qtyEl.textContent = 'Q = ' + eq.q.toFixed(2);
        }
    }

    return eq;
}

// ─── MAIN GRAPH CONTROLS ─────────────────────────────────
function updateMainGraph() {
    const ds = +document.getElementById('demandShift').value;
    const de = +document.getElementById('demandElasticity').value;
    const ss = +document.getElementById('supplyShift').value;
    const se = +document.getElementById('supplyElasticity').value;

    // Shift changes intercept; elasticity changes slope
    GRAPH.demandIntercept = GRAPH.baseDemandIntercept + ds;
    GRAPH.demandSlope = 1 / de;  // higher elasticity = flatter curve = lower slope
    GRAPH.supplyIntercept = GRAPH.baseSupplyIntercept - ss; // shift right means lower intercept
    GRAPH.supplySlope = 1 / se;

    GRAPH.floorEnabled = document.getElementById('enableFloor').checked;
    GRAPH.ceilingEnabled = document.getElementById('enableCeiling').checked;
    GRAPH.floorPrice = +document.getElementById('priceFloor').value;
    GRAPH.ceilingPrice = +document.getElementById('priceCeiling').value;
    GRAPH.showSurplus = document.getElementById('showSurplus').checked;
    GRAPH.showLabels = document.getElementById('showLabels').checked;
    GRAPH.showGrid = document.getElementById('showGrid').checked;

    // Update display values
    document.getElementById('demandShiftVal').textContent = ds > 0 ? '+' + ds : ds;
    document.getElementById('demandElasticityVal').textContent = de.toFixed(2);
    document.getElementById('supplyShiftVal').textContent = ss > 0 ? '+' + ss : ss;
    document.getElementById('supplyElasticityVal').textContent = se.toFixed(2);
    document.getElementById('priceFloorVal').textContent = GRAPH.floorPrice.toFixed(1);
    document.getElementById('priceCeilingVal').textContent = GRAPH.ceilingPrice.toFixed(1);

    // Elasticity classification labels
    updateElasLabel('demandElasLabel', de);
    updateElasLabel('supplyElasLabel', se);

    // Enable/disable price control sliders
    document.getElementById('priceFloor').disabled = !GRAPH.floorEnabled;
    document.getElementById('priceCeiling').disabled = !GRAPH.ceilingEnabled;

    drawGraph('mainCanvas', GRAPH, 'eq-info');
    updateGraphExplanation();
}

function updateGraphExplanation() {
    const box = document.getElementById('graph-explanation');
    const ds = +document.getElementById('demandShift').value;
    const ss = +document.getElementById('supplyShift').value;
    const de = +document.getElementById('demandElasticity').value;
    const se = +document.getElementById('supplyElasticity').value;

    let parts = [];

    if (ds > 0) parts.push('<strong>Demand shifted right</strong>: Non-price factors increased demand (e.g. income ↑ for normal good, substitute price ↑, more customers, positive expectations). This raises both equilibrium price and quantity.');
    if (ds < 0) parts.push('<strong>Demand shifted left</strong>: Non-price factors decreased demand (e.g. income ↓ for normal good, complement price ↑, fewer customers). This lowers both equilibrium price and quantity.');
    if (ss > 0) parts.push('<strong>Supply shifted right</strong>: Non-price factors increased supply (e.g. input costs ↓, new technology, more suppliers entering). This lowers equilibrium price but increases quantity.');
    if (ss < 0) parts.push('<strong>Supply shifted left</strong>: Non-price factors decreased supply (e.g. input costs ↑, tighter regulations, suppliers exiting). This raises equilibrium price but decreases quantity.');

    if (de < 0.5) parts.push('Demand is <strong>very inelastic</strong> (steep curve) — quantity demanded barely responds to price changes. Think: necessities, few substitutes.');
    else if (de > 2) parts.push('Demand is <strong>very elastic</strong> (flat curve) — quantity demanded is highly responsive to price changes. Think: many substitutes, luxury items.');
    if (se < 0.5) parts.push('Supply is <strong>very inelastic</strong> (steep curve) — quantity supplied barely responds to price changes. Think: short run, limited capacity.');
    else if (se > 2) parts.push('Supply is <strong>very elastic</strong> (flat curve) — quantity supplied is highly responsive. Think: long run, excess capacity, many firms.');

    if (GRAPH.floorEnabled) {
        const eq = getEquilibrium(GRAPH.demandIntercept, GRAPH.demandSlope, GRAPH.supplyIntercept, GRAPH.supplySlope);
        if (eq && GRAPH.floorPrice > eq.p)
            parts.push('<strong>Price Floor active (above equilibrium)</strong>: Creates a <em>surplus</em> — quantity supplied exceeds quantity demanded. Example: minimum wage above market wage → unemployment.');
        else
            parts.push('<strong>Price Floor set below equilibrium</strong>: Has no effect (redundant) — the market already prices above it.');
    }
    if (GRAPH.ceilingEnabled) {
        const eq = getEquilibrium(GRAPH.demandIntercept, GRAPH.demandSlope, GRAPH.supplyIntercept, GRAPH.supplySlope);
        if (eq && GRAPH.ceilingPrice < eq.p)
            parts.push('<strong>Price Ceiling active (below equilibrium)</strong>: Creates a <em>shortage</em> — quantity demanded exceeds quantity supplied. Example: rent controls → housing shortage.');
        else
            parts.push('<strong>Price Ceiling set above equilibrium</strong>: Has no effect (redundant) — the market already prices below it.');
    }

    if (parts.length === 0) {
        parts.push('Drag the <strong>Shift</strong> sliders to move curves left/right (non-price factors). Adjust <strong>Elasticity</strong> to change responsiveness. Enable <strong>Price Floor/Ceiling</strong> to see government intervention effects.');
    }

    box.innerHTML = '<p>' + parts.join('</p><p>') + '</p>';
}

// Bind all controls
['demandShift', 'demandElasticity', 'supplyShift', 'supplyElasticity',
 'priceFloor', 'priceCeiling', 'enableFloor', 'enableCeiling',
 'showSurplus', 'showLabels', 'showGrid'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateMainGraph);
});

document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('demandShift').value = 0;
    document.getElementById('demandElasticity').value = 1;
    document.getElementById('supplyShift').value = 0;
    document.getElementById('supplyElasticity').value = 1;
    document.getElementById('priceFloor').value = 6;
    document.getElementById('priceCeiling').value = 3;
    document.getElementById('enableFloor').checked = false;
    document.getElementById('enableCeiling').checked = false;
    document.getElementById('showSurplus').checked = true;
    document.getElementById('showLabels').checked = true;
    document.getElementById('showGrid').checked = true;
    // Reset scenario dropdown
    document.getElementById('scenarioSelect').value = '';
    document.getElementById('scenario-detail').classList.add('hidden');
    updateMainGraph();
});

// ─── SCENARIOS ────────────────────────────────────────────
const SCENARIOS = [
    {
        id: 'income-up-normal',
        title: 'Income rises (Normal Good)',
        category: 'demand',
        tag: 'Demand Shift',
        preview: 'Consumer income increases → demand for normal goods rises.',
        cause: '<strong>Cause:</strong> Consumer income increases (e.g. wage growth, tax cuts).',
        mechanism: '<strong>Mechanism:</strong> Normal goods have positive income elasticity (IED > 0). Higher income means consumers can afford more → demand curve shifts right.',
        result: '<strong>Result:</strong> Equilibrium price ↑ and equilibrium quantity ↑.',
        example: '<strong>Irish example:</strong> During the Celtic Tiger (1990s–2000s), rising incomes shifted demand right for housing, cars, and dining — prices and quantities all rose.',
        params: { demandShift: 3, supplyShift: 0, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'income-up-inferior',
        title: 'Income rises (Inferior Good)',
        category: 'demand',
        tag: 'Demand Shift',
        preview: 'Consumer income increases → demand for inferior goods falls.',
        cause: '<strong>Cause:</strong> Consumer income increases.',
        mechanism: '<strong>Mechanism:</strong> Inferior goods have negative income elasticity (IED < 0). As people earn more, they switch to premium alternatives → demand curve shifts left.',
        result: '<strong>Result:</strong> Equilibrium price ↓ and equilibrium quantity ↓.',
        example: '<strong>Irish example:</strong> During the Celtic Tiger boom, demand for supermarket own-brand products fell as consumers switched to premium brands.',
        params: { demandShift: -3, supplyShift: 0, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'substitute-price-up',
        title: 'Substitute Price Rises',
        category: 'demand',
        tag: 'Demand Shift',
        preview: 'A rival product becomes more expensive → demand for your good rises.',
        cause: '<strong>Cause:</strong> The price of a substitute good increases.',
        mechanism: '<strong>Mechanism:</strong> Substitutes have positive cross-price elasticity (CED > 0). Consumers switch away from the now-expensive rival → demand for your good shifts right.',
        result: '<strong>Result:</strong> Equilibrium price ↑ and equilibrium quantity ↑.',
        example: '<strong>Example:</strong> If Pepsi raises prices, demand for Coca-Cola increases. If Netflix raises subscription fees, demand for Amazon Prime rises.',
        params: { demandShift: 3, supplyShift: 0, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'complement-price-up',
        title: 'Complement Price Rises',
        category: 'demand',
        tag: 'Demand Shift',
        preview: 'A complementary product becomes more expensive → demand for your good falls.',
        cause: '<strong>Cause:</strong> The price of a complement good increases.',
        mechanism: '<strong>Mechanism:</strong> Complements have negative cross-price elasticity (CED < 0). If one becomes expensive, demand for both decreases → demand curve shifts left.',
        result: '<strong>Result:</strong> Equilibrium price ↓ and equilibrium quantity ↓.',
        example: '<strong>Example:</strong> If fuel prices soar, demand for cars decreases. If mortgage rates rise, demand for houses falls.',
        params: { demandShift: -3, supplyShift: 0, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'tastes-increase',
        title: 'Consumer Tastes/Preferences Shift',
        category: 'demand',
        tag: 'Demand Shift',
        preview: 'A product becomes fashionable or trendy → demand rises.',
        cause: '<strong>Cause:</strong> Tastes and preferences change in favour of the product (e.g. health trends, social media, advertising).',
        mechanism: '<strong>Mechanism:</strong> More consumers want the product at every price level → demand curve shifts right.',
        result: '<strong>Result:</strong> Equilibrium price ↑ and equilibrium quantity ↑.',
        example: '<strong>Example:</strong> Growing health awareness increased demand for organic food; social media trends can suddenly boost demand for a product.',
        params: { demandShift: 3, supplyShift: 0, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'input-costs-up',
        title: 'Input Costs Increase',
        category: 'supply',
        tag: 'Supply Shift',
        preview: 'Production becomes more expensive → supply decreases.',
        cause: '<strong>Cause:</strong> Costs of production increase (raw materials, wages, energy, new pension/tax requirements).',
        mechanism: '<strong>Mechanism:</strong> Higher costs reduce profitability at each price point → firms supply less → supply curve shifts left.',
        result: '<strong>Result:</strong> Equilibrium price ↑ and equilibrium quantity ↓.',
        example: '<strong>Irish example:</strong> Irish SMEs faced cost increases from auto-enrolment pensions and minimum wage rises. Cork restaurants closed in Jan 2024 due to rising costs → supply shifted left.',
        params: { demandShift: 0, supplyShift: -3, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'technology-up',
        title: 'Technology Improvement',
        category: 'supply',
        tag: 'Supply Shift',
        preview: 'Better technology → supply increases.',
        cause: '<strong>Cause:</strong> A technological advancement improves productivity.',
        mechanism: '<strong>Mechanism:</strong> Firms can produce more at each price → supply curve shifts right. This is essentially each unit becoming cheaper to produce.',
        result: '<strong>Result:</strong> Equilibrium price ↓ and equilibrium quantity ↑.',
        example: '<strong>Example:</strong> AI and computing make businesses more productive. In the EV market, battery technology improvements have increased supply and lowered prices over time.',
        params: { demandShift: 0, supplyShift: 3, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'regulations-up',
        title: 'Government Regulations Increase',
        category: 'supply',
        tag: 'Supply Shift',
        preview: 'Stricter regulations → supply decreases.',
        cause: '<strong>Cause:</strong> Government imposes new environmental, safety, or labour regulations.',
        mechanism: '<strong>Mechanism:</strong> Compliance raises production costs → firms supply less at each price → supply curve shifts left.',
        result: '<strong>Result:</strong> Equilibrium price ↑ and equilibrium quantity ↓.',
        example: '<strong>Example:</strong> Biden-era climate rules on oil production increased costs for energy firms. Environmental regulations and safety standards raise costs for manufacturers.',
        params: { demandShift: 0, supplyShift: -2, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'new-suppliers',
        title: 'New Suppliers Enter Market',
        category: 'supply',
        tag: 'Supply Shift',
        preview: 'More firms enter → supply increases.',
        cause: '<strong>Cause:</strong> Profitable conditions attract new entrepreneurs and firms to the market.',
        mechanism: '<strong>Mechanism:</strong> More suppliers in the market → total quantity supplied increases at each price → supply curve shifts right. (Long-run effect.)',
        result: '<strong>Result:</strong> Equilibrium price ↓ and equilibrium quantity ↑.',
        example: '<strong>Example:</strong> China\'s EV market — initially Tesla/Nissan, now many manufacturers have entered → supply shifted right → prices fell significantly.',
        params: { demandShift: 0, supplyShift: 3, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'business-expectations',
        title: 'Business Expectations Change',
        category: 'supply',
        tag: 'Supply Shift',
        preview: 'Firms\' expectations about future prices or conditions can shift supply.',
        cause: '<strong>Cause:</strong> Firms anticipate future price increases or deteriorating market conditions.',
        mechanism: '<strong>Mechanism:</strong> If firms expect prices to rise → they may hold off current supply (shift left). If outlook is negative → firms may exit the market (shift left). Positive expectations can attract entry (shift right).',
        result: '<strong>Result:</strong> Expectations of rising prices → supply ↓ → equilibrium price ↑, quantity ↓. Expectations of falling conditions → supply ↓ similarly.',
        example: '<strong>Example:</strong> Oil producers holding back supply in anticipation of higher future prices. Negative economic outlook causing firms to exit, reducing supply.',
        params: { demandShift: 0, supplyShift: -2, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'combined-growth',
        title: 'Economic Growth (D↑ and S↑)',
        category: 'combined',
        tag: 'Combined',
        preview: 'Both demand and supply increase — quantity rises, price effect ambiguous.',
        cause: '<strong>Cause:</strong> Economic growth increases consumer income (demand ↑) while also enabling firms to expand and adopt new tech (supply ↑).',
        mechanism: '<strong>Mechanism:</strong> Demand curve and supply curve both shift right. Quantity unambiguously increases. Price effect depends on the relative magnitude of the shifts.',
        result: '<strong>Result:</strong> Equilibrium quantity ↑. Price rises if demand shift > supply shift; falls if supply shift > demand shift.',
        example: '<strong>Irish example:</strong> Celtic Tiger — both demand and supply grew rapidly, with demand outpacing supply in housing → prices rose sharply.',
        params: { demandShift: 3, supplyShift: 3, demandElasticity: 1, supplyElasticity: 1 }
    },
    {
        id: 'combined-stagflation',
        title: 'Cost-Push (D unchanged, S↓)',
        category: 'combined',
        tag: 'Combined',
        preview: 'Supply falls while demand stays constant — prices rise, output falls.',
        cause: '<strong>Cause:</strong> A supply shock (e.g. crop failure, war disruption, pandemic) reduces supply while demand is unchanged.',
        mechanism: '<strong>Mechanism:</strong> Supply curve shifts left. Demand remains constant. If supply is inelastic, the price increase is large with only a small output reduction.',
        result: '<strong>Result:</strong> Equilibrium price ↑ and equilibrium quantity ↓.',
        example: '<strong>Example:</strong> COVID-19 semiconductor shortage — supply dropped drastically, car prices rose sharply. Bad weather destroying crops → food prices spike.',
        params: { demandShift: 0, supplyShift: -4, demandElasticity: 1, supplyElasticity: 0.4 }
    },
    {
        id: 'price-floor',
        title: 'Price Floor (Minimum Price)',
        category: 'controls',
        tag: 'Price Controls',
        preview: 'Government sets a minimum price above equilibrium → creates surplus.',
        cause: '<strong>Cause:</strong> Government imposes a legally mandated minimum price above the equilibrium (e.g. minimum wage, agricultural price supports).',
        mechanism: '<strong>Mechanism:</strong> At the higher price, quantity supplied > quantity demanded → persistent surplus. Effective only when set above equilibrium; redundant when below.',
        result: '<strong>Result:</strong> Surplus (excess stock / unemployment if in labour market). Producers supply more than consumers want to buy at that price.',
        example: '<strong>Example:</strong> Minimum wage above market wage → unemployment (surplus of labour). Agricultural price supports in the EU → surplus crops ("butter mountains").',
        params: { demandShift: 0, supplyShift: 0, demandElasticity: 1, supplyElasticity: 1, floorEnabled: true, floorPrice: 7 }
    },
    {
        id: 'price-ceiling',
        title: 'Price Ceiling (Maximum Price)',
        category: 'controls',
        tag: 'Price Controls',
        preview: 'Government sets a maximum price below equilibrium → creates shortage.',
        cause: '<strong>Cause:</strong> Government sets a legally mandated maximum price below the equilibrium (e.g. rent controls, essential goods price caps).',
        mechanism: '<strong>Mechanism:</strong> At the lower price, quantity demanded > quantity supplied → persistent shortage. Effective only when set below equilibrium; redundant when above.',
        result: '<strong>Result:</strong> Shortage — consumers want more than firms are willing to supply at that price. Not typically imposed on luxury goods.',
        example: '<strong>Example:</strong> Rent controls below market rent → housing shortage (demand for rental housing exceeds supply). Price caps on bread/fuel in developing economies.',
        params: { demandShift: 0, supplyShift: 0, demandElasticity: 1, supplyElasticity: 1, ceilingEnabled: true, ceilingPrice: 3 }
    },
    {
        id: 'inelastic-supply-demand-up',
        title: 'Demand ↑ with Inelastic Supply',
        category: 'combined',
        tag: 'Combined',
        preview: 'When supply is inelastic, a demand increase causes a large price rise but small quantity increase.',
        cause: '<strong>Cause:</strong> Demand increases (any non-price factor) while supply is inelastic (e.g. short run, limited capacity, housing).',
        mechanism: '<strong>Mechanism:</strong> The steep supply curve means producers can\'t easily ramp up output. Most of the adjustment comes through price.',
        result: '<strong>Result:</strong> Large price ↑, small quantity ↑. Elasticity of supply has a stronger effect on changes in equilibrium quantity.',
        example: '<strong>Irish example:</strong> Housing — PES ≈ 0.9 (inelastic). When demand for housing rose, prices spiked dramatically because supply couldn\'t keep up. Dublin PES even more inelastic at 0.75.',
        params: { demandShift: 3, supplyShift: 0, demandElasticity: 1, supplyElasticity: 0.3 }
    },
    {
        id: 'elastic-supply-demand-up',
        title: 'Demand ↑ with Elastic Supply',
        category: 'combined',
        tag: 'Combined',
        preview: 'When supply is elastic, a demand increase causes a small price rise but large quantity increase.',
        cause: '<strong>Cause:</strong> Demand increases while supply is elastic (e.g. long run, excess capacity, many firms).',
        mechanism: '<strong>Mechanism:</strong> The flat supply curve means producers can easily ramp up output. Most of the adjustment comes through quantity.',
        result: '<strong>Result:</strong> Small price ↑, large quantity ↑.',
        example: '<strong>Example:</strong> Digital goods (e.g. streaming subscriptions) have nearly perfectly elastic supply — increased demand adds users at minimal extra cost.',
        params: { demandShift: 3, supplyShift: 0, demandElasticity: 1, supplyElasticity: 3 }
    },
    {
        id: 'inelastic-demand-supply-up',
        title: 'Supply ↑ with Inelastic Demand',
        category: 'combined',
        tag: 'Combined',
        preview: 'When demand is inelastic, a supply increase causes a large price fall but small quantity increase.',
        cause: '<strong>Cause:</strong> Supply increases (any non-price factor) while demand is inelastic (e.g. necessities, few substitutes).',
        mechanism: '<strong>Mechanism:</strong> The steep demand curve means consumers don\'t respond much to price changes. Most of the adjustment comes through price.',
        result: '<strong>Result:</strong> Large price ↓, small quantity ↑. Elasticity of demand has a stronger effect on changes in equilibrium price.',
        example: '<strong>Strategic insight:</strong> If demand is inelastic, do NOT increase supply — prices will fall faster than output rises, so total revenue falls.',
        params: { demandShift: 0, supplyShift: 3, demandElasticity: 0.3, supplyElasticity: 1 }
    },
    {
        id: 'elastic-demand-supply-up',
        title: 'Supply ↑ with Elastic Demand',
        category: 'combined',
        tag: 'Combined',
        preview: 'When demand is elastic, a supply increase causes a small price fall but large quantity increase.',
        cause: '<strong>Cause:</strong> Supply increases while demand is elastic (e.g. many substitutes, luxury goods).',
        mechanism: '<strong>Mechanism:</strong> The flat demand curve means consumers are very responsive. Most of the adjustment comes through quantity.',
        result: '<strong>Result:</strong> Small price ↓, large quantity ↑.',
        example: '<strong>Strategic insight:</strong> If demand is elastic, increase supply — output grows faster than price declines, so total revenue rises.',
        params: { demandShift: 0, supplyShift: 3, demandElasticity: 3, supplyElasticity: 1 }
    },
    {
        id: 'engineered-shortage',
        title: 'Engineered Shortage (Strategic)',
        category: 'controls',
        tag: 'Price Controls',
        preview: 'Firms deliberately limit supply or sell below equilibrium to create scarcity and buzz.',
        cause: '<strong>Cause:</strong> Firms deliberately restrict supply or price below equilibrium to create excess demand.',
        mechanism: '<strong>Mechanism:</strong> By selling at a price below what the market would clear at, quantity demanded exceeds quantity supplied → shortage → scarcity → buzz, prestige, media attention.',
        result: '<strong>Result:</strong> Shortage creates brand prestige, free advertising, and allows premium pricing on secondary markets.',
        example: '<strong>Examples:</strong> Nike limited drops, Supreme releases, gaming console launches. Concert tickets sold below equilibrium → engineered shortage → positive media and free advertising. F1 makes racing scarce to increase TV rights price.',
        params: { demandShift: 2, supplyShift: -2, demandElasticity: 0.6, supplyElasticity: 0.4, ceilingEnabled: true, ceilingPrice: 3.5 }
    },
];

// ─── SCENARIO DROPDOWN ────────────────────────────────────
function populateScenarioDropdown() {
    const groups = { demand: 'opt-demand', supply: 'opt-supply', combined: 'opt-combined', controls: 'opt-controls' };
    SCENARIOS.forEach((s, i) => {
        const grp = document.getElementById(groups[s.category]);
        if (!grp) return;
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = s.title;
        grp.appendChild(opt);
    });
}

document.getElementById('scenarioSelect').addEventListener('change', function () {
    const detail = document.getElementById('scenario-detail');
    if (this.value === '') {
        // Manual control — hide detail, reset sliders
        detail.classList.add('hidden');
        return;
    }
    const s = SCENARIOS[+this.value];
    if (!s) return;

    // Show scenario info
    document.getElementById('scenario-title').textContent = s.title;
    const tagClass = { demand: 'tag-demand', supply: 'tag-supply', combined: 'tag-combined', controls: 'tag-controls' }[s.category];
    const tagEl = document.getElementById('scenario-category');
    tagEl.className = 'scenario-tag ' + tagClass;
    tagEl.textContent = s.tag;
    document.getElementById('scenario-cause').innerHTML = s.cause;
    document.getElementById('scenario-mechanism').innerHTML = s.mechanism;
    document.getElementById('scenario-result').innerHTML = s.result;
    document.getElementById('scenario-example').innerHTML = s.example;
    detail.classList.remove('hidden');

    // Animate main graph sliders to scenario params
    const p = s.params;
    animateMainGraphTo(p);
});

function animateMainGraphTo(params) {
    // Read current slider values
    const startDs = +document.getElementById('demandShift').value;
    const startDe = +document.getElementById('demandElasticity').value;
    const startSs = +document.getElementById('supplyShift').value;
    const startSe = +document.getElementById('supplyElasticity').value;

    const targetDs = params.demandShift || 0;
    const targetDe = params.demandElasticity || 1;
    const targetSs = params.supplyShift || 0;
    const targetSe = params.supplyElasticity || 1;

    const duration = 800;
    const start = performance.now();

    function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        document.getElementById('demandShift').value = lerp(startDs, targetDs, ease);
        document.getElementById('demandElasticity').value = lerp(startDe, targetDe, ease);
        document.getElementById('supplyShift').value = lerp(startSs, targetSs, ease);
        document.getElementById('supplyElasticity').value = lerp(startSe, targetSe, ease);

        // Handle price controls at halfway point
        if (t > 0.5) {
            if (params.floorEnabled) {
                document.getElementById('enableFloor').checked = true;
                document.getElementById('priceFloor').disabled = false;
                document.getElementById('priceFloor').value = params.floorPrice || 6;
            }
            if (params.ceilingEnabled) {
                document.getElementById('enableCeiling').checked = true;
                document.getElementById('priceCeiling').disabled = false;
                document.getElementById('priceCeiling').value = params.ceilingPrice || 3;
            }
        }

        updateMainGraph();

        if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

// Reset button also resets scenario dropdown
const origResetHandler = document.getElementById('resetBtn').onclick;

// ─── ELASTICITY CLASSIFICATION LABEL ─────────────────────
function updateElasLabel(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    // Remove all classification classes
    el.classList.remove('elas-pelastic', 'elas-elastic', 'elas-unit', 'elas-inelastic', 'elas-pinelastic');
    let text, cls;
    if (value <= 0.15) {
        text = 'Perfectly inelastic'; cls = 'elas-pinelastic';
    } else if (value < 0.9) {
        text = 'Inelastic'; cls = 'elas-inelastic';
    } else if (value <= 1.1) {
        text = 'Unit elastic'; cls = 'elas-unit';
    } else if (value < 3.9) {
        text = 'Elastic'; cls = 'elas-elastic';
    } else {
        text = 'Perfectly elastic'; cls = 'elas-pelastic';
    }
    el.textContent = text;
    el.classList.add(cls);
}

// ─── GOOD TYPE MINI GRAPHS ──────────────────────────────
function drawGoodTypeGraphs() {
    document.querySelectorAll('.good-canvas').forEach(canvas => {
        const type = canvas.dataset.good;
        if (!type) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const { width: W, height: H } = getLogicalSize(canvas);
        ctx.clearRect(0, 0, W, H);

        const pad = { top: 15, right: 15, bottom: 30, left: 35 };
        const plotW = W - pad.left - pad.right;
        const plotH = H - pad.top - pad.bottom;
        const maxQ = 10, maxP = 10;

        function m(q, p) {
            return {
                x: pad.left + (q / maxQ) * plotW,
                y: pad.top + (1 - p / maxP) * plotH
            };
        }

        // Axes
        ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, pad.top);
        ctx.lineTo(pad.left, pad.top + plotH);
        ctx.lineTo(pad.left + plotW, pad.top + plotH);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = '#888'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('Q', pad.left + plotW / 2, H - 4);
        ctx.save();
        ctx.translate(10, pad.top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('P', 0, 0);
        ctx.restore();

        // Draw curves based on type
        if (type === 'normal') {
            drawMiniDemand(ctx, m, maxQ, maxP, 9, 1, '#ef476f', false);
            drawMiniDemand(ctx, m, maxQ, maxP, 12, 1, '#ef476f', true); // shifted right
            drawArrow(ctx, m(4, 5), m(6, 5), '#333');
            drawMiniLabel(ctx, 'D', m(7.5, 1.5), '#ef476f');
            drawMiniLabel(ctx, "D'", m(9.5, 2.5), '#ef476f');
            drawMiniLabel(ctx, 'Income ↑', m(5, 6), '#555');
        } else if (type === 'inferior') {
            drawMiniDemand(ctx, m, maxQ, maxP, 9, 1, '#ef476f', false);
            drawMiniDemand(ctx, m, maxQ, maxP, 6, 1, '#ef476f', true); // shifted left
            drawArrow(ctx, m(6, 5), m(4, 5), '#333');
            drawMiniLabel(ctx, 'D', m(7.5, 1.5), '#ef476f');
            drawMiniLabel(ctx, "D'", m(4.5, 1.5), '#ef476f');
            drawMiniLabel(ctx, 'Income ↑', m(5, 6), '#555');
        } else if (type === 'giffen') {
            // Upward-sloping demand
            ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 2;
            ctx.beginPath();
            for (let q = 1; q <= 9; q += 0.2) {
                const p = 1 + 0.9 * q;
                if (p > maxP) break;
                const pt = m(q, p);
                if (q === 1) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            drawMiniLabel(ctx, 'D (Giffen)', m(5, 6.5), '#ef476f');
            // Show "P↑ → Qd↑"
            ctx.fillStyle = '#555'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('P↑ → Qd↑', m(5, 8.5).x, m(5, 8.5).y);
        } else if (type === 'veblen') {
            // Upward-sloping demand
            ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 2;
            ctx.beginPath();
            for (let q = 1; q <= 9; q += 0.2) {
                const p = 0.5 + 1.0 * q;
                if (p > maxP) break;
                const pt = m(q, p);
                if (q === 1) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            drawMiniLabel(ctx, 'D (Veblen)', m(4.5, 6), '#ef476f');
            ctx.fillStyle = '#555'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('P↑ → Status↑ → Qd↑', m(5, 8.5).x, m(5, 8.5).y);
        } else if (type === 'substitute') {
            drawMiniDemand(ctx, m, maxQ, maxP, 9, 1, '#ef476f', false);
            drawMiniDemand(ctx, m, maxQ, maxP, 12, 1, '#ef476f', true);
            drawArrow(ctx, m(4, 5), m(6, 5), '#333');
            drawMiniLabel(ctx, 'D', m(7.5, 1.5), '#ef476f');
            drawMiniLabel(ctx, "D'", m(9.5, 2.5), '#ef476f');
            drawMiniLabel(ctx, 'Sub. P↑', m(5, 6), '#555');
        } else if (type === 'complement') {
            drawMiniDemand(ctx, m, maxQ, maxP, 9, 1, '#ef476f', false);
            drawMiniDemand(ctx, m, maxQ, maxP, 6, 1, '#ef476f', true);
            drawArrow(ctx, m(6, 5), m(4, 5), '#333');
            drawMiniLabel(ctx, 'D', m(7.5, 1.5), '#ef476f');
            drawMiniLabel(ctx, "D'", m(4.5, 1.5), '#ef476f');
            drawMiniLabel(ctx, 'Comp. P↑', m(5, 6), '#555');
        }
    });
}

function drawMiniDemand(ctx, m, maxQ, maxP, intercept, slope, color, dashed) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([5, 4]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    for (let q = 0; q <= maxQ; q += 0.2) {
        const p = intercept - slope * q;
        if (p < 0 || p > maxP) { started = false; continue; }
        const pt = m(q, p);
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawArrow(ctx, from, to, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    // Arrowhead
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLen = 7;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle - 0.4), to.y - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(to.x - headLen * Math.cos(angle + 0.4), to.y - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
}

function drawMiniLabel(ctx, text, pt, color) {
    ctx.fillStyle = color;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(text, pt.x, pt.y);
}

// ─── ELASTICITY GRAPHS ───────────────────────────────────
function drawElasticityGraphs() {
    drawPEDGraph();
    drawPESGraph();
    drawIEDGraph();
    drawCEDGraph();
}

function drawPEDGraph() {
    const canvas = document.getElementById('pedCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width: W, height: H } = getLogicalSize(canvas);
    const pad = { top: 25, right: 25, bottom: 45, left: 50 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const maxQ = 10, maxP = 10;

    ctx.clearRect(0, 0, W, H);

    function m(q, p) {
        return {
            x: pad.left + (q / maxQ) * plotW,
            y: pad.top + (1 - p / maxP) * plotH
        };
    }

    // Grid
    ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 0.7;
    for (let i = 0; i <= maxQ; i += 2) { const {x} = m(i,0); ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top+plotH); ctx.stroke(); }
    for (let i = 0; i <= maxP; i += 2) { const {y} = m(0,i); ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left+plotW, y); ctx.stroke(); }

    // Axes
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top+plotH); ctx.lineTo(pad.left+plotW, pad.top+plotH); ctx.stroke();
    ctx.fillStyle = '#555'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Quantity', pad.left + plotW/2, H - 6);
    ctx.save(); ctx.translate(12, pad.top + plotH/2); ctx.rotate(-Math.PI/2); ctx.fillText('Price', 0, 0); ctx.restore();

    const ped = +document.getElementById('pedSlider').value;
    document.getElementById('pedValue').textContent = ped.toFixed(2);

    // Highlight active row
    ['pinelastic', 'inelastic', 'unit', 'elastic', 'pelastic'].forEach(r =>
        document.getElementById('ped-row-' + r).classList.remove('highlight-row'));
    if (ped === 0) document.getElementById('ped-row-pinelastic').classList.add('highlight-row');
    else if (ped < 1) document.getElementById('ped-row-inelastic').classList.add('highlight-row');
    else if (ped === 1) document.getElementById('ped-row-unit').classList.add('highlight-row');
    else if (ped < 5) document.getElementById('ped-row-elastic').classList.add('highlight-row');
    else document.getElementById('ped-row-pelastic').classList.add('highlight-row');

    // Draw demand curve: P = 9 - slope*Q, slope = 1/ped
    const dI = 9;
    const slope = ped === 0 ? 9999 : 1 / ped;

    ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    if (ped >= 4.9) {
        // Nearly perfectly elastic: horizontal line
        const p = 5;
        const p1 = m(0, p), p2 = m(maxQ, p);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    } else if (ped === 0) {
        // Perfectly inelastic: vertical line
        const q = 5;
        const p1 = m(q, 0), p2 = m(q, maxP);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    } else {
        for (let q = 0; q <= maxQ; q += 0.1) {
            const p = dI - slope * q;
            if (p < 0 || p > maxP) { started = false; continue; }
            const pt = m(q, p);
            if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
            else ctx.lineTo(pt.x, pt.y);
        }
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ef476f'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left';
    if (ped >= 4.9) ctx.fillText('D (perfectly elastic)', m(6, 5.4).x, m(6, 5.4).y);
    else if (ped === 0) ctx.fillText('D (perfectly inelastic)', m(5.4, 7).x, m(5.4, 7).y);
    else {
        const lq = Math.min(maxQ - 1, (dI - 1) / slope);
        ctx.fillText('D', m(lq, 1).x + 6, m(lq, 1).y);
    }

    // Revenue box
    const revP1 = 4, revP2 = 3;
    const revQ1 = ped === 0 ? 5 : Math.max(0, (dI - revP1) / slope);
    const revQ2 = ped === 0 ? 5 : Math.max(0, (dI - revP2) / slope);
    const rev1 = revP1 * revQ1;
    const rev2 = revP2 * revQ2;

    ctx.fillStyle = '#333'; ctx.font = '11px system-ui'; ctx.textAlign = 'left';
    const revText = `P ${revP1}→${revP2}: TR ${rev1.toFixed(1)}→${rev2.toFixed(1)} (${rev2 > rev1 ? '↑' : rev2 < rev1 ? '↓' : '='})`;
    ctx.fillText(revText, pad.left + 8, pad.top + 16);
}

function drawPESGraph() {
    const canvas = document.getElementById('pesCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width: W, height: H } = getLogicalSize(canvas);
    const pad = { top: 25, right: 25, bottom: 45, left: 50 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const maxQ = 10, maxP = 10;

    ctx.clearRect(0, 0, W, H);
    function m(q, p) { return { x: pad.left + (q/maxQ)*plotW, y: pad.top + (1-p/maxP)*plotH }; }

    // Grid
    ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 0.7;
    for (let i = 0; i <= maxQ; i += 2) { const {x}=m(i,0); ctx.beginPath(); ctx.moveTo(x,pad.top); ctx.lineTo(x,pad.top+plotH); ctx.stroke(); }
    for (let i = 0; i <= maxP; i += 2) { const {y}=m(0,i); ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+plotW,y); ctx.stroke(); }

    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left,pad.top); ctx.lineTo(pad.left,pad.top+plotH); ctx.lineTo(pad.left+plotW,pad.top+plotH); ctx.stroke();
    ctx.fillStyle = '#555'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Quantity', pad.left+plotW/2, H-6);
    ctx.save(); ctx.translate(12, pad.top+plotH/2); ctx.rotate(-Math.PI/2); ctx.fillText('Price', 0, 0); ctx.restore();

    const pes = +document.getElementById('pesSlider').value;
    document.getElementById('pesValue').textContent = pes.toFixed(2);

    ['pinelastic','inelastic','unit','elastic','pelastic'].forEach(r =>
        document.getElementById('pes-row-'+r).classList.remove('highlight-row'));
    if (pes === 0) document.getElementById('pes-row-pinelastic').classList.add('highlight-row');
    else if (pes < 1) document.getElementById('pes-row-inelastic').classList.add('highlight-row');
    else if (pes === 1) document.getElementById('pes-row-unit').classList.add('highlight-row');
    else if (pes < 5) document.getElementById('pes-row-elastic').classList.add('highlight-row');
    else document.getElementById('pes-row-pelastic').classList.add('highlight-row');

    // Supply: P = 1 + slope*Q, slope = 1/pes
    const sI = 1;
    const slope = pes === 0 ? 9999 : 1 / pes;

    ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (pes >= 4.9) {
        const p = 5;
        const p1 = m(0, p), p2 = m(maxQ, p);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    } else if (pes === 0) {
        const q = 5;
        const p1 = m(q, 0), p2 = m(q, maxP);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    } else {
        let started = false;
        for (let q = 0; q <= maxQ; q += 0.1) {
            const p = sI + slope * q;
            if (p < 0 || p > maxP) { started = false; continue; }
            const pt = m(q, p);
            if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
            else ctx.lineTo(pt.x, pt.y);
        }
    }
    ctx.stroke();

    ctx.fillStyle = '#06d6a0'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left';
    if (pes >= 4.9) ctx.fillText('S (perfectly elastic)', m(6, 5.4).x, m(6, 5.4).y);
    else if (pes === 0) ctx.fillText('S (perfectly inelastic)', m(5.4, 7).x, m(5.4, 7).y);
    else ctx.fillText('S', m(Math.min(maxQ-1, (maxP-1-sI)/slope), maxP-1).x + 6, m(0, maxP-1).y);
}

function drawIEDGraph() {
    const canvas = document.getElementById('iedCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width: W, height: H } = getLogicalSize(canvas);
    const pad = { top: 25, right: 25, bottom: 45, left: 50 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const ied = +document.getElementById('iedSlider').value;
    document.getElementById('iedValue').textContent = ied.toFixed(2);

    ['luxury','necessity','inferior'].forEach(r =>
        document.getElementById('ied-row-'+r).classList.remove('highlight-row'));
    if (ied > 1) document.getElementById('ied-row-luxury').classList.add('highlight-row');
    else if (ied > 0) document.getElementById('ied-row-necessity').classList.add('highlight-row');
    else document.getElementById('ied-row-inferior').classList.add('highlight-row');

    // Draw: Income on X, Quantity on Y
    const maxIncome = 10, maxQty = 10;
    function m(inc, qty) { return { x: pad.left + (inc/maxIncome)*plotW, y: pad.top + (1 - qty/maxQty)*plotH }; }

    // Grid
    ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 0.7;
    for (let i = 0; i <= maxIncome; i += 2) { const {x}=m(i,0); ctx.beginPath(); ctx.moveTo(x,pad.top); ctx.lineTo(x,pad.top+plotH); ctx.stroke(); }
    for (let i = 0; i <= maxQty; i += 2) { const {y}=m(0,i); ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+plotW,y); ctx.stroke(); }

    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left,pad.top); ctx.lineTo(pad.left,pad.top+plotH); ctx.lineTo(pad.left+plotW,pad.top+plotH); ctx.stroke();
    ctx.fillStyle = '#555'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Income', pad.left+plotW/2, H-6);
    ctx.save(); ctx.translate(12, pad.top+plotH/2); ctx.rotate(-Math.PI/2); ctx.fillText('Quantity Demanded', 0, 0); ctx.restore();

    // Engel curve: Q = baseQ + ied * (Income - baseIncome)
    const baseIncome = 5, baseQ = 5;
    ctx.strokeStyle = '#4361ee'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (let inc = 0; inc <= maxIncome; inc += 0.1) {
        const q = baseQ + ied * (inc - baseIncome);
        if (q < 0 || q > maxQty) { started = false; continue; }
        const pt = m(inc, q);
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = '#4361ee'; ctx.font = 'bold 12px system-ui';
    if (ied >= 0) {
        ctx.textAlign = 'left';
        ctx.fillText(ied > 1 ? 'Luxury' : ied > 0 ? 'Necessity' : 'Inferior', m(8, baseQ + ied * 3).x + 6, m(8, baseQ + ied * 3).y);
    } else {
        ctx.textAlign = 'left';
        ctx.fillText('Inferior', m(8, baseQ + ied * 3).x + 6, m(8, baseQ + ied * 3).y);
    }
}

function drawCEDGraph() {
    const canvas = document.getElementById('cedCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width: W, height: H } = getLogicalSize(canvas);
    const pad = { top: 25, right: 25, bottom: 45, left: 50 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const ced = +document.getElementById('cedSlider').value;
    document.getElementById('cedValue').textContent = ced.toFixed(2);

    ['substitute','complement','unrelated'].forEach(r =>
        document.getElementById('ced-row-'+r).classList.remove('highlight-row'));
    if (ced > 0.05) document.getElementById('ced-row-substitute').classList.add('highlight-row');
    else if (ced < -0.05) document.getElementById('ced-row-complement').classList.add('highlight-row');
    else document.getElementById('ced-row-unrelated').classList.add('highlight-row');

    // Price of Y on X, Quantity of X on Y
    const maxPY = 10, maxQX = 10;
    function m(py, qx) { return { x: pad.left + (py/maxPY)*plotW, y: pad.top + (1 - qx/maxQX)*plotH }; }

    ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 0.7;
    for (let i = 0; i <= maxPY; i += 2) { const {x}=m(i,0); ctx.beginPath(); ctx.moveTo(x,pad.top); ctx.lineTo(x,pad.top+plotH); ctx.stroke(); }
    for (let i = 0; i <= maxQX; i += 2) { const {y}=m(0,i); ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+plotW,y); ctx.stroke(); }

    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left,pad.top); ctx.lineTo(pad.left,pad.top+plotH); ctx.lineTo(pad.left+plotW,pad.top+plotH); ctx.stroke();
    ctx.fillStyle = '#555'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Price of Good Y', pad.left+plotW/2, H-6);
    ctx.save(); ctx.translate(12, pad.top+plotH/2); ctx.rotate(-Math.PI/2); ctx.fillText('Demand for Good X', 0, 0); ctx.restore();

    // Q_x = baseQ + ced * (P_y - basePY)
    const basePY = 5, baseQ = 5;
    ctx.strokeStyle = ced >= 0 ? '#06d6a0' : '#ef476f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (let py = 0; py <= maxPY; py += 0.1) {
        const qx = baseQ + ced * (py - basePY);
        if (qx < 0 || qx > maxQX) { started = false; continue; }
        const pt = m(py, qx);
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = ced >= 0 ? '#06d6a0' : '#ef476f';
    ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left';
    const label = ced > 0.05 ? 'Substitutes' : ced < -0.05 ? 'Complements' : 'Unrelated';
    const labelPt = m(8, baseQ + ced * 3);
    ctx.fillText(label, labelPt.x + 6, labelPt.y);
}

// Bind elasticity sliders
['pedSlider', 'pesSlider', 'iedSlider', 'cedSlider'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', function () {
        // Uncheck any radio preset when slider is manually adjusted
        const presetGroup = this.closest('.elasticity-info');
        if (presetGroup) {
            presetGroup.querySelectorAll('.elas-presets input[type="radio"]').forEach(r => r.checked = false);
        }
        drawElasticityGraphs();
    });
});

// Elasticity radio presets — click to jump slider
document.querySelectorAll('.elas-presets input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', function () {
        const sliderId = this.closest('.elas-presets').dataset.slider;
        const slider = document.getElementById(sliderId);
        if (slider) {
            slider.value = this.value;
            drawElasticityGraphs();
        }
    });
});

// ─── INIT ─────────────────────────────────────────────────
updateMainGraph();
populateScenarioDropdown();
drawElasticityGraphs();
drawGoodTypeGraphs();

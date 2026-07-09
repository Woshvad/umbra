pragma circom 2.1.6;
// ============================================================================
// Umbra CRYP-03 — reduced proof-of-correct-clearing circuit (PoC-grade).
//
// PROVES, over N sealed orders with published Poseidon commitments comm[i], that
// the prover knows each order (side,qty,limit,salt) and its fill, and that the
// published clearing (pStar, matched) is FAIR + CONSERVING over the COMMITTED
// batch — while revealing NO order's values (side/qty/limit/salt/fill stay in the
// PRIVATE witness; only [pStar, matched, comm…] are public).
//
//   (d) commitment binding: Poseidon(side,qty,limit,salt) == comm[i]  for all i
//   (a) quantity bound:      fill_i <= qty_i
//   (b) limit compliance:    fill_i>0 ⇒ (buy: limit_i>=pStar) ∧ (sell: limit_i<=pStar)
//   (c) conservation:        Σ_buy fill = Σ_sell fill = matched
//
// REDUCTION (honest scope): this proves fairness + conservation at the PUBLISHED
// p*; it does NOT prove p* is the volume-maximizing price (dynamic sort/tie-break
// in-circuit is the production scaling path — a documented reduction, A4).
//
// TRUSTED SETUP: the Groth16 setup that produces clearing_final.zkey / vkey.json
// is a SINGLE-CONTRIBUTOR LOCAL setup (build.mjs) — labeled "PoC trusted setup /
// cryptographer-review-gated" (A5). A production deployment needs a multi-party
// powers-of-tau ceremony. Verification is OFF-LEDGER by design: Canton has NO zk
// precompile (a documented HARD limitation); only the proof/vkey HASH is anchored
// on-ledger.
//
// Verbatim from 10-RESEARCH.md "Reduced CRYP-03 clearing circuit" (compiled to
// 1221 non-linear constraints on this box). Pitfall 4: triple products are split
// into intermediate signals (fb/fs) to keep every constraint quadratic.
// ============================================================================
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template Clearing(N) {
    signal input pStar; signal input matched; signal input comm[N];      // public
    signal input side[N]; signal input qty[N]; signal input limit[N];    // private witness
    signal input salt[N]; signal input fill[N];

    component H[N];
    for (var i=0;i<N;i++){ H[i]=Poseidon(4);
        H[i].inputs[0]<==side[i]; H[i].inputs[1]<==qty[i];
        H[i].inputs[2]<==limit[i]; H[i].inputs[3]<==salt[i];
        comm[i]===H[i].out; }                                            // (d) commitment binding
    for (var i=0;i<N;i++){ side[i]*(side[i]-1)===0; }                    // side ∈ {0,1}

    component le[N];
    for (var i=0;i<N;i++){ le[i]=LessEqThan(16);
        le[i].in[0]<==fill[i]; le[i].in[1]<==qty[i]; le[i].out===1; }    // (a) fill ≤ qty

    component buyOk[N]; component sellOk[N]; component hasFill[N];
    signal fb[N]; signal fs[N];
    for (var i=0;i<N;i++){
        hasFill[i]=GreaterThan(16); hasFill[i].in[0]<==fill[i]; hasFill[i].in[1]<==0;
        buyOk[i]=GreaterEqThan(32); buyOk[i].in[0]<==limit[i]; buyOk[i].in[1]<==pStar;
        sellOk[i]=LessEqThan(32);   sellOk[i].in[0]<==limit[i]; sellOk[i].in[1]<==pStar;
        fb[i] <== hasFill[i].out*side[i];      fb[i]*(1-buyOk[i].out)===0;   // (b) buy fill ⇒ limit≥p*
        fs[i] <== hasFill[i].out*(1-side[i]);  fs[i]*(1-sellOk[i].out)===0;  //     sell fill ⇒ limit≤p*
    }
    signal bcontrib[N]; signal scontrib[N]; var sb=0; var ss=0;
    for (var i=0;i<N;i++){ bcontrib[i]<==fill[i]*side[i]; scontrib[i]<==fill[i]*(1-side[i]);
        sb+=bcontrib[i]; ss+=scontrib[i]; }
    sb===matched; ss===matched;                                          // (c) Σbuy=Σsell=matched
}
component main {public [pStar, matched, comm]} = Clearing(3);

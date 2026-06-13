import type { Brand } from "./types";

// BRANDS — per-brand identity from the EmailAuto Campaign Playbook (docs/email-campaign-playbook.html,
// v1.3) + docs/email-template-analysis.md. Personas, corrected segment IDs, subject/urgency/preheader
// formulas, and hero products all encode confirmed WIN patterns from 46 .eml templates.
//
// Hero images use a per-brand placeholder path; the studio lets the marketer override per campaign.

export const BRANDS: Record<string, Brand> = {
  bra_goddess: {
    id: "bra_goddess",
    name: "BraGoddess",
    domain: "bragoddess.com",
    layout: "narrative",
    accent: "#c12a4e",
    accentRange: ["#a02338", "#d63268"],
    heroSlug: "daisybra",
    heroImage: "https://bragoddess.com/email/hero.jpg",
    logoImage: "https://bragoddess.com/email/logo.png",
    persona: "Sandra",
    voice:
      "Warm, first-person from Sandra. Opens with a named-person micro-story (a neighbor, friend, or sister) tied to a specific comfort/confidence moment, names a real pain (shoulder marks, poor fit, back ache), then bridges to the product as the natural relief. Social proof woven into narrative, never a standalone statistic. Never opens with a feature/checkmark bullet list.",
    subjectFormula: "Emotion-first + offer second. e.g. \"[Emotional state], {{first_name}}, [price/% + product hint]\".",
    subjectMax: 55,
    subjectMin: 45,
    urgencyType: "Soft social + time — \"someone just grabbed theirs\", \"tonight only\", \"before midnight\". Never hard sales pressure.",
    preheaderFormula: "Add time pressure or supplied social proof not in the subject, e.g. \"'Til Midnight ⚡\".",
    offSymbol: "o.f.f",
    freeShipThreshold: "35",
    defaultProductCount: 6,
    productSegments: [
      {
        code: "21",
        label: "Bralettes/Comfort",
        meta: "Low AOV · High freq",
        guidance:
          "Daily comfort seekers — loyal, high-frequency buyers. Acknowledge the ritual of a bra that makes life easier; speak to first-look access and the update they deserve.",
      },
      {
        code: "22",
        label: "Contour/Push-Up",
        meta: "Med AOV · Med freq",
        guidance:
          "Structure/shape-focused buyers — they want lift, support, confidence. Name the exact shape goal; bridge to styles that elevate what they already love.",
      },
      {
        code: "45",
        label: "Shapers/Panties",
        meta: "Med AOV · Low freq",
        guidance:
          "Infrequent add-on buyers — they complete the set. Cross-sell: \"your wardrobe is almost complete\"; suggest a specific pairing.",
      },
      {
        code: "8",
        label: "Sleepwear/Tights",
        meta: "Med AOV · Med freq",
        guidance:
          "Comfort-first lifestyle buyers — prioritize softness. Bridge from sleepwear comfort language to everyday bra comfort.",
      },
      {
        code: "3",
        label: "Strapless/Special-Occasion",
        meta: "Med AOV · Low freq",
        guidance:
          "Special-occasion buyers — bought for a moment or outfit. Acknowledge the occasion; bridge to the next event; urgency is event-driven, not generic time pressure.",
      },
    ],
    catalog: [
      { slug: "daisybra", name: "Daisy Bra 3", price: "12.99", hero: true, url: "https://bragoddess.com/daisybra", usps: ["Easy snap front closure", "Wire-free lift & support", "Breathable soft fabric", "3-second front fasten"], review: `"Forgot it's there!" — Helen R.` },
      { slug: "posybra", name: "Posy Bra", price: "19.99", url: "https://bragoddess.com/posybra", usps: ["Front-hook ease", "Smoothing back panel", "Lace detail", "Comfortable all-day"], review: `"My 2nd order!" — Sharon M.` },
      { slug: "sonashape", name: "SonaShape", price: "19.99", url: "https://bragoddess.com/sonashape", usps: ["Daily comfort seamless fit", "Invisible under clothing", "Gentle lift", "Zero wire"], review: `"Underwires? Never again." — Claire T.` },
      { slug: "activabra", name: "Activa Bra 2.0", price: "16.99", url: "https://bragoddess.com/activabra", usps: ["Gentle support", "Wide comfort straps", "All-day wear", "Upgraded v2.0 fit"], review: `"Best decision ever!" — Judith K.` },
      { slug: "zoeshape", name: "ZoeShape", price: "19.99", url: "https://bragoddess.com/zoeshape", usps: ["Powerful lifting & shaping", "Full coverage", "Smooths everything"], review: `"Smooths everything!" — Barbara H.` },
      { slug: "ziplacy", name: "ZipLacy", price: "24.99", url: "https://bragoddess.com/ziplacy", usps: ["Front zip closure", "Powerful support", "Quick on/off"], review: `"Game-changer!" — Shirley D.` },
      { slug: "mirahug", name: "MiraHug", price: "19.99", url: "https://bragoddess.com/mirahug", usps: ["Ultimate lifting & shaping", "Posture-corrector design", "Hugs all day"], review: `"Like a hug all day!" — Frances T.` },
      { slug: "bustella", name: "Bustella", price: "18.99", url: "https://bragoddess.com/bustella", usps: ["Full bust support", "Wire-free comfort", "Adjustable straps"], review: `"Finally found my fit!" — Grace H.` },
      { slug: "moonabra", name: "Moona Bra 2", price: "14.99", url: "https://bragoddess.com/moonabra", usps: ["3-second front snap", "Easy on/off", "Comfort support"], review: `"So easy to put on!" — Martha O.` },
      { slug: "easeblooming", name: "EaseBlooming", price: "19.99", url: "https://bragoddess.com/easeblooming", usps: ["Bloom-like wire-free fit", "Ultra-soft fabric", "Gentle lift"], review: `"Feels like a second skin!" — Dorothy P.` },
      { slug: "lushfitting", name: "LushFitting", price: "19.99", url: "https://bragoddess.com/lushfitting", usps: ["Lush comfort fit", "Perfect body contour", "Seamless design"], review: `"Perfect every time!" — Norma B.` },
      { slug: "zenchicbra", name: "ZenChic Bra", price: "22.99", url: "https://bragoddess.com/zenchicbra", usps: ["Zen comfort design", "Chic lace overlay", "Smooth silhouette"], review: `"Elegant and comfortable!" — Eleanor W.` },
      { slug: "zenalift", name: "ZenaLift", price: "14.99", url: "https://bragoddess.com/zenalift", usps: ["Ultimate lift", "Zero discomfort", "Innovative shape"], review: `"Amazing support!" — Evelyn P.` },
      { slug: "fionabra", name: "Fiona Bra", price: "19.99", url: "https://bragoddess.com/fionabra", usps: ["Elegant lace design", "Wire-free support", "Beautiful detailing"], review: `"Feels luxurious!" — Fiona D.` },
      { slug: "aerisoft", name: "AeriSoft", price: "19.99", url: "https://bragoddess.com/aerisoft", usps: ["Airy soft mesh fabric", "Wire-free comfort", "Lightweight design"], review: `"Like wearing a cloud!" — Ruth A.` },
      { slug: "elisebra", name: "EliseBra", price: "19.98", url: "https://bragoddess.com/elisebra", usps: ["Elegant Elise design", "Wire-free freedom", "Smooth finish"], review: `"My daily favourite!" — Elise M.` },
      { slug: "ellebloom", name: "ElleBloom", price: "16.99", url: "https://bragoddess.com/ellebloom", usps: ["Blooming comfort style", "Soft breathable fabric", "All-day wear"], review: `"Love the design!" — Lorraine C.` },
      { slug: "curvylace", name: "CurvyLace", price: "19.99", url: "https://bragoddess.com/curvylace", usps: ["Curvy fit design", "Beautiful lace overlay", "All sizes welcome"], review: `"Made for my shape!" — Marge R.` },
      { slug: "lunahug", name: "LunaHug", price: "19.99", url: "https://bragoddess.com/lunahug", usps: ["Luna gentle support", "Hugging comfort", "Soft stretch fabric"], review: `"Gentle and supportive!" — Luna K.` },
      { slug: "senobra", name: "Senobra", price: "14.99", url: "https://bragoddess.com/senobra", usps: ["Senior-comfort focused", "Extra-wide soft straps", "Easy front closure"], review: `"Designed for comfort!" — Irene T.` },
      { slug: "ivylift", name: "IvyLift", price: "16.99", url: "https://bragoddess.com/ivylift", usps: ["Seamless wire-free push-up", "Sculpt & define", "Lightweight feel"], review: `"Never going back!" — Nancy W.` },
      { slug: "honeycurve", name: "HoneyCurve", price: "22.99", url: "https://bragoddess.com/honeycurve", usps: ["Powerful custom-lift support", "Honeycomb design", "Shaping technology"], review: `"Perfect shape!" — Patricia L.` },
      { slug: "rosylift", name: "RosyLift", price: "22.99", url: "https://bragoddess.com/rosylift", usps: ["Best-selling custom lift", "Adjustable support", "Wire-free comfort"], review: `"My favourite!" — Linda S.` },
      { slug: "liftyglow", name: "LiftyGlow", price: "19.99", url: "https://bragoddess.com/liftyglow", usps: ["Flexi-lift comfy bra", "Flexible underwire-free", "Glowing comfort"], review: `"Incredible lift!" — Joyce B.` },
      { slug: "evaglow-bra", name: "EvaGlow Bra", price: "19.99", url: "https://bragoddess.com/evaglowbra", usps: ["Seamless powerful lift", "Cleavage boost", "Breathable fabric"], review: `"Feels like nothing!" — Rose C.` },
      { slug: "uplacy", name: "UpLacy", price: "14.99", url: "https://bragoddess.com/uplacy", usps: ["Front zip support", "Wireless lift", "AirFlow mesh", "Smooth side fit"], review: `"Good fit and soft touch" — Anna` },
      { slug: "emmabra", name: "EmmaBra", price: "16.99", url: "https://bragoddess.com/emmabra", usps: ["Hidden front closure", "Full coverage support", "Breathable microfiber mesh", "Posture-friendly fit"], review: `"No more painful wrists and shoulders" — Eleanor Vance` },
      { slug: "serenabra", name: "Serena Bra", price: "19.99", url: "https://bragoddess.com/serenabra", usps: ["Easy-on comfort", "Kind lift support", "Smooth side shape", "Soft mature fit"], review: `"Worth every penny!" — Linda M.` },
      { slug: "amourlift", name: "AmourLift", price: "24.99", url: "https://bragoddess.com/amourlift", usps: ["Custom-lift sling", "A-G cup coverage", "Bust shaping support", "Wire-free comfort"], review: `"The custom sling is a real deal" — Mary Harris` },
      { slug: "curvyflex", name: "CurvyFlex", price: "22.99", url: "https://bragoddess.com/curvyflex", usps: ["8 custom-lift levels", "Side smoothing support", "Wide comfort straps", "Soft roomy cups"], review: `"Finally, a bra that actually supports." — Melissa` },
      { slug: "ellacurve", name: "EllaCurve", price: "19.99", url: "https://bragoddess.com/ellacurve", usps: ["No-bounce support", "Wireless lift", "Soft secure fit", "Pretty everyday shape"], review: `"Busty busy lady approved" — Chloe` },
      { slug: "sofilace", name: "SofiLace", price: "16.99", url: "https://bragoddess.com/sofilace", usps: ["High-waist sculpting", "Leakproof protection", "Elegant lace finish", "Comfortable senior fit"], review: `"Life-Changing Comfort" — Olivia M` },
    ],
  },

  gents_lux: {
    id: "gents_lux",
    name: "GentsLux",
    domain: "gentslux.com",
    layout: "simple",
    accent: "#013a63",
    accentRange: ["#002850", "#1d3d56"],
    heroSlug: "jettjeans",
    heroImage: "https://gentslux.com/email/hero.jpg",
    logoImage: "https://gentslux.com/email/logo.png",
    persona: "Jordan",
    voice:
      "Premium, masculine, restrained, first-person from Jordan — direct and confident, no over-effusive sign-off. Curiosity-gap opener that withholds the offer; uses a named male testimonial tied to a physical pain point (stiff knees, restricted movement). Impeccable grammar — a single error destroys the premium positioning.",
    subjectFormula: "Curiosity + scarcity; name mid-subject. e.g. \"{{first_name}}, [incomplete thought about discovery]...\". Offer implied, revealed in preheader.",
    subjectMax: 58,
    subjectMin: 48,
    urgencyType: "Fear of loss + scarcity — \"limited stock\", \"ends tonight\", \"this price won't repeat\". Confident, not desperate.",
    preheaderFormula: "Reveal the offer scale + urgency the subject withheld, e.g. \"24 hours. The lowest prices in GentsLux history.\".",
    offSymbol: "o.f.f",
    freeShipThreshold: "50",
    defaultProductCount: 6,
    productSegments: [
      {
        code: "71",
        label: "Men's Tops",
        meta: "Med AOV · High freq",
        guidance:
          "Frequent tops buyers — they return regularly. Acknowledge style consistency; make the case the bottoms complete what they already own. Wardrobe completion, not isolated purchase.",
      },
      {
        code: "72",
        label: "Men's Bottoms",
        meta: "High AOV · Med freq",
        guidance:
          "Premium pants buyers — high value, high churn risk. Speak to fit specificity, durability data, and exactly how these differ from what they have.",
      },
      {
        code: "73",
        label: "Men's Others",
        meta: "Med AOV · Low freq",
        guidance:
          "Lapsed or peripheral buyers — bought something small/non-core. Step them up to the flagship; lead with one compelling reason and remove risk via guarantee + easy returns.",
      },
    ],
    catalog: [
      { slug: "jettjeans", name: "JettJeans", price: "32.99", hero: true, url: "https://gentslux.com/jettjeans", usps: ["Comfortable sit/bend/walk", "4-way stretch fabric", "Classic tailored look"], review: `"Comfortable all day." — Terry D.` },
      { slug: "icyshorts", name: "IcyShorts", price: "18.98", url: "https://gentslux.com/icyshorts", usps: ["Ice silk cooling fabric", "Quick-dry 4× faster", "Stays cool all day"], review: `"Saved my summer!" — Frank D.` },
      { slug: "flexcamo", name: "FlexCamo", price: "29.99", url: "https://gentslux.com/flexcamo", usps: ["Tactical camo design", "4-way flex fabric", "6 deep pockets"], review: `"Great for everything!" — Mike R.` },
      { slug: "timelessflex", name: "TimelessFlex", price: "24.99", url: "https://gentslux.com/timelessflex", usps: ["Timeless classic style", "Pull-on elastic waist", "Versatile dress-casual"], review: `"Looks sharp, feels great." — Robert W.` },
      { slug: "meshirons", name: "MeshIrons", price: "24.99", url: "https://gentslux.com/meshirons", usps: ["Breathable mesh panels", "Wrinkle-resistant fabric", "Easy care wash"], review: `"Always looks pressed." — Carl M.` },
      { slug: "easetactic", name: "EaseTactic", price: "26.99", url: "https://gentslux.com/easetactic", usps: ["Tactical ease design", "Stretch-flex waist", "Light & durable"], review: `"Built for action." — James B.` },
      { slug: "oldenease", name: "OldenEase", price: "29.95", url: "https://gentslux.com/oldenease", usps: ["Senior comfort focused", "No belt wrestling", "Gentle elastic waist"], review: `"Finally pants that fit." — Harold P.` },
      { slug: "stretchactive", name: "StretchActive", price: "24.99", url: "https://gentslux.com/stretchactive", usps: ["Super stretch 4-way", "Machine washable", "Casual to sport"], review: `"Stretches perfectly." — Dennis W.` },
      { slug: "easeflexor", name: "EaseFlexor", price: "22.97", url: "https://gentslux.com/easeflexor", usps: ["Ease of movement", "Pull-on comfort waist", "All-day wear"], review: `"Move without restriction." — George K.` },
      { slug: "multipants", name: "MultiPants", price: "29.99", url: "https://gentslux.com/multipants", usps: ["6 deep pockets", "4-way stretch", "No-fuss design"], review: `"Everything fits!" — Harold B.` },
      { slug: "airflexion", name: "AirFlexion", price: "29.99", url: "https://gentslux.com/airflexion", usps: ["Pull-on elastic waist", "No belt wrestling", "360° stretch"], review: `"Step in, ready to go!" — George P.` },
      { slug: "easemotions", name: "EaseMotions", price: "32.99", url: "https://gentslux.com/easemotions", usps: ["Ease of motion design", "Stretch fabric", "Lightweight feel"], review: `"Moves with me all day." — Larry S.` },
      { slug: "modenease", name: "ModenEase", price: "32.99", url: "https://gentslux.com/modenease", usps: ["Modern ease design", "Stretch waistband", "Smart casual look"], review: `"Modern and comfortable." — Steven H.` },
      { slug: "stretchmotions", name: "StretchMotions", price: "29.99", url: "https://gentslux.com/stretchmotions", usps: ["Superb stretch", "6 deep pockets", "All-terrain wear"], review: `"Best pants I own!" — Dennis W.` },
      { slug: "tactishirt", name: "TactiShirt", price: "22.95", url: "https://gentslux.com/tactishirt", usps: ["Tactical shirt design", "Breathable mesh back", "Rugged daily wear"], review: `"Perfect outdoor shirt." — Brian K.` },
      { slug: "glidepants", name: "GlidePants", price: "26.99", url: "https://gentslux.com/glidepants", usps: ["Smooth glide fabric", "Easy pull-on fit", "Active comfort"], review: `"Glides on perfectly." — Alan T.` },
      { slug: "glideactive", name: "GlideActive", price: "27.99", url: "https://gentslux.com/glideactive", usps: ["Active glide fit", "Quick-dry fabric", "Sport-casual design"], review: `"Great for all activities." — Paul R.` },
      { slug: "ice-strider", name: "IceStrider", price: "24.99", url: "https://gentslux.com/ice-strider", usps: ["Room without sloppiness", "Cool ice fabric", "Sharp look"], review: `"Sharp and comfy." — Robert K.` },
      { slug: "steelstitch", name: "SteelStitch", price: "29.99", url: "https://gentslux.com/steelstitch", usps: ["Double-stitched durability", "Relaxed stretch fit", "100% real denim", "Work-to-weekend style"], review: `"Amazing quality" — James R.` },
      { slug: "gentsflex", name: "GentsFlex", price: "24.99", url: "https://gentslux.com/gentsflex", usps: ["Elastic hidden drawstring", "Straight-fit denim", "Breathable stretch fabric", "Polished belt-ready look"], review: `"Comfort and sharp good looks." — Warren` },
      { slug: "flexrover", name: "FlexRover", price: "29.99", url: "https://gentslux.com/flexrover", usps: ["6 practical pockets", "10-inch flex waistband", "Durable cargo fabric", "Roomy deep-crotch fit"], review: `"Great for hunting and outdoor activity" — Keith` },
    ],
  },

  lux_fitting: {
    id: "lux_fitting",
    name: "LuxFitting",
    domain: "luxfitting.com",
    layout: "simple",
    accent: "#f2305f",
    accentRange: ["#e7324a", "#fe397b"],
    heroSlug: "stretchactive-lf",
    heroImage: "https://luxfitting.com/email/hero.jpg",
    logoImage: "https://luxfitting.com/email/logo.png",
    persona: "Adele",
    voice:
      "Energetic, feminine, sensory, first-person from Adele — friendly conversation. Subject uses a sensory comparison anchored to a specific price (\"comfier than a nightgown\", \"feel THIS good for 💲14.98\"). ONE hook per email — never stack spring + birthday + comfort. Health-adjacent benefits stay non-medical.",
    subjectFormula: "Price-anchored + sensory. Best formula: \"[sensory comparison] for 💲[price]?\".",
    subjectMax: 56,
    subjectMin: 44,
    urgencyType: "Gratitude + deadline — \"as a thank-you, but only until midnight tonight\". Warm, not pushy.",
    preheaderFormula: "Escalate the tension, e.g. \"Thanks but this ends midnight!\".",
    offSymbol: "O.F.F",
    freeShipThreshold: "35",
    defaultProductCount: 6,
    productSegments: [
      {
        code: "61",
        label: "Women's Tops",
        meta: "Med AOV · High freq",
        guidance:
          "Frequent tops buyers — know what they like. Acknowledge style loyalty; cross-sell bottoms/dresses that complete the outfit. Effortless-outfit angle.",
      },
      {
        code: "62",
        label: "Women's Bottoms",
        meta: "High AOV · High freq",
        guidance:
          "High-value bottoms buyers — spend more, return often, high competitor risk. Speak to fit precision, fabric quality, what makes these different.",
      },
      {
        code: "63",
        label: "Women's Dresses",
        meta: "High AOV · Med freq",
        guidance:
          "Occasion-driven dress buyers — shop for moments, not routinely. Create occasion urgency; make it feel like it arrived at the right time.",
      },
      {
        code: "64",
        label: "Women's Others",
        meta: "Med AOV · Low freq",
        guidance:
          "Infrequent peripheral buyers — bought something non-core. Bridge from what they bought to the main collection; remove risk; make the step up easy.",
      },
    ],
    catalog: [
      { slug: "stretchactive-lf", name: "StretchActive", price: "24.99", hero: true, url: "https://luxfitting.com/stretchactive", usps: ["4-way stretch comfort", "High-rise waist", "Machine washable"], review: `"Moves with me perfectly." — Sandra T.` },
      { slug: "icy-shorts-lf", name: "Icy Shorts", price: "16.98", url: "https://luxfitting.com/icyshorts", usps: ["Ice silk cooling", "Easy stretch waist", "Light & breezy"], review: `"No pinching at all!" — Marissa T.` },
      { slug: "airygrace", name: "AiryGrace", price: "29.99", url: "https://luxfitting.com/airygrace", usps: ["Airy drape fabric", "Pull-on ease", "Lightweight comfort"], review: `"Feels so light!" — Diane M.` },
      { slug: "softygrace", name: "SoftyGrace", price: "32.99", url: "https://luxfitting.com/softygrace", usps: ["Silky pull-on waist", "No press or roll", "All-day soft comfort"], review: `"Wore it all day!" — Linda R.` },
      { slug: "glamorease", name: "GlamorEase", price: "26.99", url: "https://luxfitting.com/glamorease", usps: ["Glamorous easy wear", "Stretch comfort waist", "Effortless style"], review: `"Glamorous and easy!" — Gloria P.` },
      { slug: "comfijeans", name: "ComfiJeans", price: "26.99", url: "https://luxfitting.com/comfijeans", usps: ["Comfortable stretch jeans", "Soft elastic waist", "Smart casual look"], review: `"Jeans I actually love." — Carol S.` },
      { slug: "flowycharm", name: "FlowyCharm", price: "29.99", url: "https://luxfitting.com/flowycharm", usps: ["Flowy charm design", "Lightweight drape fabric", "Breezy & elegant"], review: `"So charming and comfortable!" — Donna H.` },
      { slug: "easeflexor-lf", name: "EaseFlexor", price: "17.99", url: "https://luxfitting.com/easeflexor", usps: ["Ease of movement", "Flex comfort waist", "Everyday versatile"], review: `"Easy to wear, easy to move." — Alice B.` },
      { slug: "soraease", name: "SoraEase", price: "26.99", url: "https://luxfitting.com/soraease", usps: ["Soaring lightweight feel", "Breathable soft fabric", "All-day comfort"], review: `"Feels like nothing!" — Norma C.` },
      { slug: "ellaflow", name: "EllaFlow", price: "29.99", url: "https://luxfitting.com/ellaflow", usps: ["Ella flow drape fabric", "Elegant silhouette", "Breathable wear"], review: `"Elegant and effortless!" — Ella W.` },
      { slug: "linenglam", name: "LinenGlam", price: "32.99", url: "https://luxfitting.com/linenglam", usps: ["Ultra soft LinoWeave", "Glamorous style", "Wrinkle-resistant"], review: `"So classy!" — Beverly H.` },
      { slug: "flexcozy", name: "FlexCozy", price: "17.99", url: "https://luxfitting.com/flexcozy", usps: ["Flexible cozy fit", "Soft stretch fabric", "Relaxed comfort"], review: `"Cozy and flexible!" — Marie K.` },
      { slug: "loragrace", name: "LoraGrace", price: "26.99", url: "https://luxfitting.com/loragrace", usps: ["Lora grace design", "Comfort waist", "Timeless style"], review: `"Grace in every step!" — Laura N.` },
      { slug: "ella-ease", name: "EllaEase", price: "34.99", url: "https://luxfitting.com/ellaease", usps: ["Gentle stretch", "Helps knee/leg movement", "Everyday comfort"], review: `"My legs feel free!" — Shirley D.` },
      { slug: "suede-soft", name: "SuedeSoft", price: "24.99", url: "https://luxfitting.com/suedesoft", usps: ["Buttery suede feel", "Wrinkle-resistant", "Looks expensive"], review: `"Looks expensive!" — Patricia O.` },
      { slug: "femijeans", name: "FemiJeans", price: "22.99", url: "https://luxfitting.com/femijeans", usps: ["5x stretch denim", "High-waist flattering fit", "Lengthening straight leg", "Durable soft denim"], review: `"In all honesty, these are the best" — Gloria S.` },
      { slug: "easetrousers", name: "EaseTrousers", price: "19.99", url: "https://luxfitting.com/easetrousers", usps: ["High-rise elastic waist", "4-way stretch twill", "4 functional pockets", "Tailored straight-leg drape"], review: `"So worth it!" — Krystal Mraz` },
      { slug: "miraease", name: "MiraEase", price: "28.99", url: "https://luxfitting.com/miraease", usps: ["Soft-stretch comfort", "Pull-on ease", "Flattering straight leg", "Easy-care fabric"], review: `"I finally found my perfect pants" — Elaine D.` },
      { slug: "softglamor", name: "SoftGlamor", price: "29.99", url: "https://luxfitting.com/softglamor", usps: ["Ultra-soft drape", "Pull-on comfort", "No-squeeze waistband", "StretchLite fabric"], review: `"Worth every penny." — Amanda J.` },
      { slug: "miraflair", name: "MiraFlair", price: "26.99", url: "https://luxfitting.com/miraflair", usps: ["Elegant wide-leg drape", "Flatters every curve", "Easy-care wear", "LitesWay fabric"], review: `"It's my favorite everyday pants now!" — Emily R.` },
    ],
  },

  santa_fare: {
    id: "santa_fare",
    name: "SantaFare",
    domain: "santafare.com",
    layout: "simple",
    accent: "#a80818",
    accentRange: ["#890106", "#c00f28"],
    heroSlug: "pouchic",
    heroImage: "https://santafare.com/email/hero.jpg",
    logoImage: "https://santafare.com/email/logo.png",
    persona: "Mary",
    voice:
      "Heritage, premium, warm, first-person from Mary — personalized gifts/accessories. Subject creates a suspended loop with mild anxiety around an earned-but-unclaimed reward, or a reluctant deadline (\"I can't extend this past midnight\"). Body uses a named gifting micro-story (\"My sister Michelle got this leather Pouchic\"). Lean 4-product layouts.",
    subjectFormula: "Suspended loop + name. Best formula: \"[Unresolved situation]... {{first_name}}'s [earned thing] = [status/risk]\".",
    subjectMax: 54,
    subjectMin: 42,
    urgencyType: "Reluctant deadline only — \"we'd love to keep this open, but we have to take it back at midnight\". Never countdown-clock energy.",
    preheaderFormula: "Reluctant deadline or suspended revelation, e.g. \"Tonight only\" / \"We're taking this back at midnight\".",
    offSymbol: "SAVING",
    freeShipThreshold: "45",
    defaultProductCount: 4,
    // SantaFare's variant axis is its gifting lifecycle (recency tiers), not categories.
    productSegments: [
      { code: "1-A", label: "Active", meta: "<90 days since last order", guidance: "Active gifters — acknowledge their recent gift; the next occasion is coming sooner than they think; gentle recency urgency." },
      { code: "1-B", label: "Drifting", meta: "90–180 days", guidance: "Drifting — \"it's almost time again\"; reference the occasion type they last gifted for; a natural continuation, not a re-sell." },
      { code: "1-C", label: "Lapsed", meta: ">180 days", guidance: "Lapsed — remove all friction; lead risk-free (free returns, gift guarantee); reference their last gift positively." },
      { code: "1-D", label: "VIP", meta: "2+ orders", guidance: "VIP — exclusive gifting angle; first-look / limited availability; speak to elevation and trusted quality." },
    ],
    catalog: [
      { slug: "pouchic", name: "Pouchic", price: "8.97", hero: true, url: "https://santafare.com/pouchic", usps: ["Snap closure leather", "Personalised engraving", "Gift-ready"], review: `"A stylish lifesaver!" — Kate W.` },
      { slug: "timelessmark", name: "TimelessMark", price: "8.95", url: "https://santafare.com/timelessmark", usps: ["Mark your place", "Personalised text", "Premium quality"], review: `"Best 💲9 I've ever spent!" — David K.` },
      { slug: "bygonemark", name: "BygoneMark", price: "9.95", url: "https://santafare.com/bygonemark", usps: ["Custom engraving", "Premium quality", "Unique keepsake"], review: `"Perfect personalised gift!" — Sarah M.` },
      { slug: "snowflake", name: "Snowflake", price: "8.99", url: "https://santafare.com/snowflake", usps: ["Unique snowflake design", "Personalised name", "Gift-ready packaging"], review: `"They loved it!" — Jennifer L.` },
      { slug: "winkkey", name: "WinkKey", price: "9.99", url: "https://santafare.com/winkkey", usps: ["Personalised key ring", "Durable metal build", "Thoughtful touch"], review: `"So thoughtful!" — Amanda R.` },
      { slug: "bloomyline", name: "Bloomy Line", price: "8.99", url: "https://santafare.com/bloomyline", usps: ["Hand-embroidered corner bookmark", "Personalized keepsake detail", "Gift-ready page marker", "Soft floral craft feel"] },
      { slug: "bespokemark", name: "Bespokemark", price: "8.99", url: "https://santafare.com/bespokemark", usps: ["Personalized magnetic clips", "PU leather vintage design", "Strong multipurpose magnets", "Initial/symbol options"], review: `"Perfect bookmark for me" — Athena Satterfield` },
    ],
  },
};

export const BRAND_LIST: Brand[] = Object.values(BRANDS);

export function getBrand(brandId: string): Brand {
  const brand = BRANDS[brandId];
  if (!brand) throw new Error(`Unknown brand: ${brandId}`);
  return brand;
}

/** Full product catalog for a brand (products are a flat campaign-level selection). */
export function brandCatalog(brandId: string): Brand["catalog"] {
  return getBrand(brandId).catalog;
}

/** Slugify on input: lowercase, strip anything outside [a-z0-9_-]. */
export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

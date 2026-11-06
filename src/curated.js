// Real upcoming Mumbai events (checked 6 Nov 2026 against the organisers' own listings on Luma, Unstop, Meetup, Konfhub,
// vybedriven.in and the mumbai2go.in aggregator). Only facts the listings state are filled in; anything a listing does not
// publish (prizes, speakers, organiser email, exact times) is left blank or called out in the description.
// Ids 9001 to 9099 are reserved for these. An admin can edit one in the app (add a poster, fix a detail): the edit is then
// saved on the server under the same id and replaces this entry for everyone. Pins are approximate; directions search by venue name.
const BASE = { level: "all", price: 0, currency: "INR", benefits: [], prizeNote: "", teamMin: null, teamMax: null, aiTools: "na", interCollege: "na", rules: "", contactEmail: "",
  faqs: [], whatsapp: "", instagram: "", linkedin: "", website: "", joined: 0, regStart: null, regDeadline: null, timeline: [], prizes: [], feeUnit: "person", eligibility: "",
  contactPhone: "", contactName: "", sample: false, curated: true, poster: null, mode: "offline", city: "Mumbai", state: "Maharashtra", country: "India", time: "10:00" };
const GO = (slug) => `https://mumbai2go.in/go/${slug}`;
const mk = (id, e) => ({ ...BASE, id, ...e });
export const CURATED = [
  mk(9001, { title: "Beyond 9to5 Buildathon", host: "EtriqAI", type: "hackathon", hostType: "company", interests: ["software", "ai"], level: "pro", venue: "Paytm Office, Vile Parle", lat: 19.099, lng: 72.85,
    date: "2026-11-22", time: "10:00", website: GO("beyond-9to5-buildathon-20261122-bcd1e1"), poster: "/posters/9001.jpg",
    desc: "A free, high-energy one-day buildathon for working professionals (10 AM to 6 PM), presented by EtriqAI with Paytm as ecosystem partner. Mumbai edition at the Paytm office, Vile Parle. Prizes, team size and agenda are not published yet, so check the registration page." }),
  mk(9002, { title: "Singularity 2.0", host: "KC College of Engineering", type: "hackathon", hostType: "college", interests: ["software", "ai"], level: "student",
    venue: "KC College of Engineering, Manpada, Ghodbunder Rd", city: "Thane", lat: 19.2518, lng: 72.9788, date: "2026-12-19", time: "15:00", interCollege: "yes",
    website: GO("singularity-2-0-20261219-e26721"), eligibility: "Engineering students.",
    desc: "An 18-hour national-level offline hackathon for engineering students, designed to test technical endurance and collaboration. Runs 19 to 20 December at KC College of Engineering and Management Studies and Research (Manpada off-campus), Thane. Free to join. Prizes and team size are not published yet." }),
  mk(9003, { title: "Quasar 5.0: 36-Hour Hackathon", host: "VPPCOEVA, Mumbai", type: "hackathon", hostType: "college", interests: ["software", "ai", "web"],
    venue: "Vasantdada Patil Pratishthan's College, Sion", lat: 19.0425, lng: 72.8641, date: "2027-01-23", time: "08:00", interCollege: "yes",
    website: "https://quasar-vppcoe.vercel.app", instagram: "https://www.instagram.com/quasar_vppcoe", contactEmail: "quasar@pvppcoe.ac.in", poster: "/posters/9003.jpg",
    eligibility: "Students, developers, designers and innovators.",
    desc: "A 36-hour international hackathon for students, developers, designers and innovators at Vasantdada Patil Pratishthan's College of Engineering and Visual Arts, Sion, Mumbai. 23 to 24 January 2027, free entry, powered by Unstop. Prizes and team size are not published yet." }),
  mk(9004, { title: "IDEA Competition 2026", host: "E-Cell CRCE", type: "hackathon", hostType: "college", interests: ["startup", "career"], level: "student", mode: "hybrid",
    venue: "Fr. Conceicao Rodrigues College of Engg, Bandra", lat: 19.0466, lng: 72.8197, date: "2027-02-06", time: "10:00", benefits: ["certificate", "prizes", "mentorship"], prizeNote: "Prize pool of \u20b950,000+",
    website: "https://unstop.com/hackathons/idea-competition-2026-fr-conceicao-rodrigues-college-of-engineering-frcrce-bandra-1736048", poster: "/posters/9004.jpg",
    timeline: [{ label: "Competition opened", date: "2026-10-28" }], eligibility: "Open to all students from any stream and college.",
    desc: "One idea, endless impact. A multi-round startup idea competition by E-Cell CRCE that runs from 28 October 2026 to 6 February 2027 (hybrid, Bandra). Submit innovative ideas and solutions to real-world problems across four impact tracks, with expert mentorship, an incubation handoff, and a certificate for clearing each round. Register on Unstop." }),
  mk(9006, { title: "Bharat Fintech Summit 2027", host: "The Digital Fifth", type: "summit", hostType: "company", interests: ["startup", "blockchain", "data"], level: "pro",
    venue: "JW Marriott Sahar, Andheri East", lat: 19.1016, lng: 72.8737, date: "2027-02-10", time: "07:30", price: 6000, prizeNote: "Tickets from \u20b96,000", website: GO("bharat-fintech-summit-2027-20270210-a8b02f"), poster: "/posters/9006.jpg",
    desc: "A two-day fintech summit with networking, presented by The Digital Fifth at JW Marriott, Sahar, Mumbai (10 to 11 February 2027). Tickets are priced from \u20b96,000. Speakers and agenda are not published yet." }),
  mk(9008, { title: "Techfest Workshops: Ethical Hacking & Cybersecurity", host: "Techfest, IIT Bombay", type: "workshop", hostType: "college", interests: ["cyber", "software"],
    venue: "IIT Bombay, Powai", lat: 19.1334, lng: 72.9133, date: "2026-12-15", time: "10:00", website: "https://techfest.org/workshops", poster: "/posters/9008.jpg",
    contactEmail: "avichal@techfest.org", contactName: "Avichal Rajpoot", contactPhone: "+91 86021 75035", prizeNote: "Code EXCLUSIVE10 gives 10% off any workshop",
    desc: "Techfest workshops at IIT Bombay, 15 to 18 December 2026. Ethical Hacking: defensive and offensive security, network exploitation, web/API vulnerabilities and AI prompt injection through hands-on CTF challenges. Cybersecurity (with EC-Council): real-world threat detection, SIEM log triage and a hands-on SOC war room breach simulation. Fees and exact schedule are on techfest.org/workshops." }),
  mk(9009, { title: "DevFest Mumbai 2026", host: "GDG MAD & GDG Cloud Mumbai", type: "conference", hostType: "community", interests: ["software", "cloud", "ai"],
    venue: "The Ballard Pier Downtown Experience Centre, Fort", lat: 18.9345, lng: 72.8403, date: "2026-12-05", time: "08:30", website: "https://luma.com/luh11tqc", poster: "/posters/9009.jpg",
    instagram: "https://www.instagram.com/gdgmad", desc: "The annual DevFest unconference by GDG MAD and GDG Cloud Mumbai, which mixes serious tech with unserious people: meet developers, learn new skills and explore ideas without a rigid schedule. 8:30 AM to 5:30 PM at the Ballard Pier Downtown Experience Centre, Fort, with Swift Mumbai as community partner. Free; registration is by request and needs host approval on Luma. More at devfestmumbai.com." }),
  mk(9010, { title: "Hack in Hills '26", host: "Web3 India x Builder Base", type: "hackathon", hostType: "community", interests: ["blockchain", "software"], mode: "hybrid",
    venue: "Manali", city: "Manali", state: "Himachal Pradesh", lat: 32.2432, lng: 77.1892, date: "2026-11-20", time: "10:00", benefits: ["certificate", "prizes"], prizeNote: "\u20b950,000 bounty pool",
    website: "https://unstop.com/o/dRs01iP", instagram: "https://www.instagram.com/vybedriven", contactEmail: "vybedriven@gmail.com", poster: "/posters/9010.jpg",
    timeline: [{ label: "Registration closed", date: "2026-10-05" }],
    desc: "A hackathon in the heart of Manali by Web3 India and Builder Base (listed on Vybe Driven). Stage 1 is an online PPT and prototype selection; only 40 builders move on to the 24+ hour offline finale on 20 November. Free to register, with a \u20b950,000 bounty pool, cash prizes and certificates. Registration closed on 5 October 2026 per the listing, so confirm on Unstop. Start time and team size are not published." }),
  mk(9011, { title: "TBO VoyageHack 4.0", host: "TBO.com", type: "hackathon", hostType: "company", interests: ["software", "web", "ai"], mode: "online",
    date: "2026-12-24", time: null, regStart: "2026-10-26", regDeadline: "2026-11-12", teamMin: 2, teamMax: 5, benefits: ["certificate", "prizes", "internship"], prizeNote: "Winners get up to \u20b93 lakh",
    website: "https://unstop.com/competitions/crp-voyagehack-40-tbocom-1774031", contactEmail: "voyagehacks@tbo.com", poster: "/posters/9011.jpg", eligibility: "Open to participants from all backgrounds. One team per person.",
    prizes: [{ place: "Winner", reward: "\u20b93,00,000" }, { place: "First runner-up", reward: "\u20b92,00,000" }, { place: "Second runner-up", reward: "\u20b91,00,000" }],
    desc: "A global online innovation competition by TBO.com on technology challenges in the travel industry. Runs 26 October to 24 December 2026; registration is free and closes 12 November. Round 1 is an idea presentation, round 2 a prototype with source code and an explainer video, then shortlisted teams pitch a jury in the grand finale. Certificates for all, and finalists may get a paid internship interview (terms apply)." }),
];

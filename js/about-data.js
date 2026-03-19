/* ============================================
   F1 PULSE - About Data Store
   Paste your custom image links in the maps below.
   ============================================ */

window.ABOUT_DATA = (() => {
    function f1DriverImage(teamSlug, driverSlug, width = 880) {
        return `https://media.formula1.com/image/upload/c_lfill,w_${width}/q_auto/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026/${teamSlug}/${driverSlug}/2026${teamSlug}${driverSlug}right.webp`;
    }

    const DRIVER_PROFILE_URLS = {};

    const TEAM_PROFILE_URLS = {};

    // PASTE DRIVER PROFILE IMAGE LINKS HERE (key = normalized last name)
    const DRIVER_IMAGE_LINKS = {
        russell: f1DriverImage('mercedes', 'georus01', 880),
        antonelli: f1DriverImage('mercedes', 'andant01', 880),
        leclerc: f1DriverImage('ferrari', 'chalec01', 880),
        hamilton: f1DriverImage('ferrari', 'lewham01', 880),
        norris: f1DriverImage('mclaren', 'lannor01', 880),
        piastri: f1DriverImage('mclaren', 'oscpia01', 880),
        verstappen: f1DriverImage('redbullracing', 'maxver01', 880),
        hadjar: f1DriverImage('redbullracing', 'isahad01', 880),
        alonso: f1DriverImage('astonmartin', 'feralo01', 880),
        stroll: f1DriverImage('astonmartin', 'lanstr01', 880),
        gasly: f1DriverImage('alpine', 'piegas01', 880),
        colapinto: f1DriverImage('alpine', 'fracol01', 880),
        albon: f1DriverImage('williams', 'alealb01', 880),
        sainz: f1DriverImage('williams', 'carsai01', 880),
        lawson: f1DriverImage('racingbulls', 'lialaw01', 880),
        lindblad: f1DriverImage('racingbulls', 'arvlin01', 880),
        ocon: f1DriverImage('haasf1team', 'estoco01', 880),
        bearman: f1DriverImage('haasf1team', 'olibea01', 880),
        hulkenberg: f1DriverImage('audi', 'nichul01', 880),
        bortoleto: f1DriverImage('audi', 'gabbor01', 880),
        perez: f1DriverImage('cadillac', 'serper01', 880),
        bottas: f1DriverImage('cadillac', 'valbot01', 880),
    };

    // PASTE TEAM PROFILE IMAGE LINKS HERE (key = team id)
    const TEAM_IMAGE_LINKS = {
        mercedes: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/mercedes/2026mercedescarright.webp',
        ferrari: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/ferrari/2026ferraricarright.webp',
        mclaren: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/mclaren/2026mclarencarright.webp',
        red_bull: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/redbullracing/2026redbullracingcarright.webp',
        aston_martin: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/astonmartin/2026astonmartincarright.webp',
        alpine: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/alpine/2026alpinecarright.webp',
        williams: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/williams/2026williamscarright.webp',
        rb: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/racingbulls/2026racingbullscarright.webp',
        haas: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/haasf1team/2026haasf1teamcarright.webp',
        audi: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/audi/2026audicarright.webp',
        cadillac: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/cadillac/2026cadillaccarright.webp',
    };

    // Per-driver portrait crop tuning for profile cards (face-focused framing)
    const DRIVER_PROFILE_FRAMING = {
        russell: '50% 2%',
        antonelli: '50% 3%',
        leclerc: '50% 2%',
        hamilton: '50% 2%',
        norris: '50% 3%',
        piastri: '50% 3%',
        verstappen: '50% 2%',
        hadjar: '50% 3%',
        alonso: '50% 3%',
        stroll: '50% 4%',
        gasly: '50% 3%',
        colapinto: '50% 4%',
        albon: '50% 3%',
        sainz: '50% 3%',
        lawson: '50% 4%',
        lindblad: '50% 4%',
        ocon: '50% 3%',
        bearman: '50% 3%',
        hulkenberg: '50% 3%',
        bortoleto: '50% 4%',
        perez: '50% 3%',
        bottas: '50% 3%',
    };

    // Team-specific gradient palettes used on both team and driver profile pages.
    const TEAM_BRAND_GRADIENTS = {
        mercedes: { top: '#3cf2dc', mid: '#11a18f', bottom: '#073e3a' },
        ferrari: { top: '#ff3f35', mid: '#b41615', bottom: '#4d0909' },
        mclaren: { top: '#ff972e', mid: '#d15d0e', bottom: '#5f2a05' },
        red_bull: { top: '#4d69ff', mid: '#243fb0', bottom: '#121f60' },
        aston_martin: { top: '#14b78c', mid: '#0b6a52', bottom: '#053329' },
        alpine: { top: '#ff6aa9', mid: '#396eff', bottom: '#1a286e' },
        williams: { top: '#4fa1ff', mid: '#2d64db', bottom: '#132b6f' },
        rb: { top: '#8793ff', mid: '#4c5fd1', bottom: '#232b76' },
        haas: { top: '#f3f4f6', mid: '#b8bcc4', bottom: '#4b515f' },
        audi: { top: '#ff4242', mid: '#ba1818', bottom: '#520b0b' },
        cadillac: { top: '#4a8eff', mid: '#2a54ba', bottom: '#131f5f' },
    };

    // Per-driver hero framing for the large top profile banner.
    const DRIVER_HERO_FRAMING = {
        russell: '80% 100%',
        antonelli: '80% 100%',
        leclerc: '79% 100%',
        hamilton: '79% 100%',
        norris: '80% 100%',
        piastri: '79% 100%',
        verstappen: '81% 100%',
        hadjar: '80% 100%',
        alonso: '80% 100%',
        stroll: '80% 100%',
        gasly: '80% 100%',
        colapinto: '80% 100%',
        albon: '80% 100%',
        sainz: '80% 100%',
        lawson: '80% 100%',
        lindblad: '80% 100%',
        ocon: '80% 100%',
        bearman: '80% 100%',
        hulkenberg: '80% 100%',
        bortoleto: '80% 100%',
        perez: '80% 100%',
        bottas: '80% 100%',
    };

    // Driver quote panel content shown on profile pages.
    const DRIVER_QUOTES = {
        russell: {
            quote: 'ON GEORGE, YOU CAN RELY ON HIM WHEN IT COMES TO LAP TIMES AND RACING, SO SPIRITS ARE HIGH.',
            by: 'Toto Wolff',
        },

        // Mercedes
        russell: {
            quote: 'ON GEORGE, YOU CAN RELY ON HIM WHEN IT COMES TO LAP TIMES AND RACING, SO SPIRITS ARE HIGH.',
            by: 'Toto Wolff',
        },
        antonelli: {
            quote: 'RACING FOR MERCEDES IS A BIG RESPONSIBILITY, BUT AT THE SAME TIME IT\'S A GREAT OPPORTUNITY AND A PRIVILEGE.',
            by: 'Kimi Antonelli',
        },

        // Ferrari
        leclerc: {
            quote: 'WHATEVER THE POSITION IS AT STAKE, YOU\'VE GOT TO DO YOUR ABSOLUTE BEST AS A DRIVER WHETHER YOU\'RE FIGHTING FOR THE FIFTH, FOURTH OR FIRST POSITION.',
            by: 'Charles Leclerc',
        },
        hamilton: {
            quote: 'DRIVING A SCUDERIA FERRARI HP CAR FOR THE FIRST TIME WAS ONE OF THE BEST FEELINGS OF MY LIFE.',
            by: 'Lewis Hamilton',
        },

        // McLaren
        norris: {
            quote: 'I\'M READY TO BRING THE FIGHT TO EVERYONE.',
            by: 'Lando Norris',
        },
        piastri: {
            quote: 'I LIKE CARS, I LIKE RACING, BUT I THINK THE COMPETITION SIDE OF THINGS IS PROBABLY THE NUMBER ONE THING.',
            by: 'Oscar Piastri',
        },

        // Haas
        ocon: {
            quote: 'TOUGH RACING IS ALWAYS COOL TO ME. RACING SIDE-BY-SIDE, BEING VERY CLOSE, THAT\'S WHAT RACING IS ALL ABOUT.',
            by: 'Esteban Ocon',
        },
        bearman: {
            quote: 'I\'M A COMPETITIVE GUY, I LIKE TO BE GOOD AT EVERYTHING I DO.',
            by: 'Oliver Bearman',
        },

        // Red Bull Racing
        verstappen: {
            quote: 'I HATE LOSING!',
            by: 'Max Verstappen',
        },
        hadjar: {
            quote: 'I\'M SOMEONE WHO FOUGHT HIS WAY TO F1 THE HARD WAY.',
            by: 'Isack Hadjar',
        },

        // Racing Bulls
        lawson: {
            quote: 'I\'M NOT HERE TO MAKE FRIENDS. I\'M HERE TO WIN - THAT\'S WHAT I\'M FOCUSED ON DOING.',
            by: 'Liam Lawson',
        },
        lindblad: {
            quote: 'SINCE I STARTED THIS JOURNEY AT FIVE YEARS OLD, IT WAS ALWAYS MY GOAL TO BE IN FORMULA 1 SO IT\'S A PROUD MOMENT TO TAKE THIS STEP.',
            by: 'Arvid Lindblad',
        },

        // Alpine
        gasly: {
            quote: 'THE MOMENT I LOVE THE MOST IS WHENEVER I GET IN THAT CAR, FIGHTING THE BEST 19 DRIVERS IN THE WORLD, AND THIS EXERCISE OF BEATING THEM.',
            by: 'Pierre Gasly',
        },
        colapinto: {
            quote: 'I WILL GIVE IT MY ALL TO DELIVER THE BEST POSSIBLE RESULTS.',
            by: 'Franco Colapinto',
        },

        // Audi
        hulkenberg: {
            quote: 'YOU\'VE GOT TO BE THERE WHEN THE OPPORTUNITY PRESENTS ITSELF, BECAUSE THE RACE IS NOT OVER UNTIL IT\'S OVER.',
            by: 'Nico Hulkenberg',
        },
        bortoleto: {
            quote: 'I WANT TO BE ABLE TO FIGHT FOR THINGS AND TO MAKE MY COUNTRY PROUD OF EVERYTHING I CAN ACHIEVE.',
            by: 'Gabriel Bortoleto',
        },

        // Williams
        sainz: {
            quote: 'I ALWAYS PERFORM AT MY BEST WHEN I JUST DON\'T CARE ABOUT THE SITUATION AND HAVE A SINGLE MENTALITY THAT IT\'S JUST GO FOR IT.',
            by: 'Carlos Sainz',
        },
        albon: {
            quote: 'I\'M READY TO WIN RACES, TO FIGHT FOR A CHAMPIONSHIP.',
            by: 'Alexander Albon',
        },

        // Cadillac
        perez: {
            quote: null, // No dedicated blockquote on the F1 profile page
            by: null,
        },
        bottas: {
            quote: null, // No dedicated blockquote on the F1 profile page
            by: null,
        },

        // Aston Martin
        alonso: {
            quote: 'I NEVER REGRET ANYTHING.',
            by: 'Fernando Alonso',
        },
        stroll: {
            quote: 'WE\'VE GROWN SO MUCH AS A TEAM AND THERE\'S STILL SO MUCH MORE TO LOOK FORWARD TO.',
            by: 'Lance Stroll',
        },
    };

    // PASTE DRIVER GALLERY LINKS HERE (leave empty strings as placeholders)
    const DRIVER_GALLERY_LINKS = {
        russell: ['', '', '', ''], antonelli: ['', '', '', ''], leclerc: ['', '', '', ''], hamilton: ['', '', '', ''],
        norris: ['', '', '', ''], piastri: ['', '', '', ''], verstappen: ['', '', '', ''], hadjar: ['', '', '', ''],
        alonso: ['', '', '', ''], stroll: ['', '', '', ''], gasly: ['', '', '', ''], colapinto: ['', '', '', ''],
        albon: ['', '', '', ''], sainz: ['', '', '', ''], lawson: ['', '', '', ''], lindblad: ['', '', '', ''],
        ocon: ['', '', '', ''], bearman: ['', '', '', ''], hulkenberg: ['', '', '', ''], bortoleto: ['', '', '', ''],
        perez: ['', '', '', ''], bottas: ['', '', '', ''],
    };

    // PASTE TEAM GALLERY LINKS HERE (leave empty strings as placeholders)
    const TEAM_GALLERY_LINKS = {
        mercedes: ['', '', '', ''], ferrari: ['', '', '', ''], mclaren: ['', '', '', ''],
        red_bull: ['', '', '', ''], aston_martin: ['', '', '', ''], alpine: ['', '', '', ''],
        williams: ['', '', '', ''], rb: ['', '', '', ''], haas: ['', '', '', ''],
        audi: ['', '', '', ''], cadillac: ['', '', '', ''],
    };

    const DRIVER_BIOGRAPHIES = {
        russell: `He's the driver with the motto: "If in doubt, go flat out".

George Russell has lived by it throughout his F1 career to date, out-qualifying seasoned team mate Robert Kubica at all 21 Grands Prix in his rookie season, putting Williams back on the podium in 2021, and landing his first race win with Mercedes in 2022.

That brilliant baseline speed served Russell well as he totted up titles on his way to Formula 1. The Briton stormed to the 2017 GP3 championship and delivered the 2018 Formula 2 crown under immense pressure.

Spotting his potential, world champions Mercedes swooped to sign him to their junior programme in 2017, when Russell already had a DTM deal on the table. He banked more experience with practice sessions with Force India and tests for the Silver Arrows, before landing his Mercedes-powered Williams race drive.

A refusal to cede ground to his rivals - and commitment to a tricky pass - underpins Russell's winning mentality. And it's what got him the call-up to replace Lewis Hamilton for a one-off Mercedes appearance for Sakhir 2020 when the reigning champ was struck down by Covid-19.

That star turn saw Russell miss out on pole by just 0.026s and then outrace Mercedes stalwart Valtteri Bottas. Only a bungled pit stop and a heart-breaking late puncture prevented a near-certain maiden win for the up-and-coming super-sub.

He kept his head down at Williams in 2021, scoring his first points and podium, all the while keeping his eye on the bigger prize. Having proved himself a hard worker and a tenacious talent, that prize arrived in the form of a chance to take on compatriot and seven-time champion Hamilton in identical machinery.

It was an opportunity Russell relished, and he took his first F1 win - and Mercedes' only 2022 victory - in Brazil. The 2023 season proved tougher, but he was again atop the podium twice in 2024, and in 2025 it was his turn to lead the team following Hamilton's departure for Ferrari.

Russell proved to be a natural, steering the Silver Arrows to two race wins in a season when Max Verstappen was the only other driver to beat the all-conquering McLarens. If Mercedes can now grab the high ground for 2026 and its all-new regulations, a title bid surely beckons - a huge challenge, but as always, 'Russell the Rocket' will be going flat out.`,
        antonelli: `Andrea Kimi Antonelli’s rise to the F1 grid has been nothing short of meteoric.

Son of sportscar racer Marco, the Bologna native was scouted by Mercedes during a karting career that saw him collect a scarcely believable number of winner's trophies.

He went on to make his car racing debut aged just 15, with more titles swiftly following – in both the Italian and ADAC F4 championships in 2022 and the Formula Regional Middle East and European categories a year later.

Most onlookers saw F3 as the logical next move, but Mercedes already knew they had a star on their hands and decided that promotion to F2 – effectively skipping a step on the ladder – would better serve their latest hot prospect.

It was always going to be a lot to ask of the teenager, with the noise around his future prospects only growing when Lewis Hamilton dropped the bombshell that he would be swapping Mercedes for Ferrari in 2025 – opening up a spot alongside George Russell.

Antonelli got his head down to make a solid rather than spectacular start to life in F2, consistently scoring points, but not yet reaching the podium, while his Prema Racing team and the rest of the grid tried to understand the nuances of the series’ new car package.

Then, midway through the season, Antonelli started to show a much larger audience what he could do – while delivering on the faith that Mercedes talent spotter Gwen Lagrue and team boss Toto Wolff had placed in him.

A breakthrough Sprint victory in the rain at Silverstone was followed by a maiden Feature win at the Hungaroring, before he left the paddock speechless at Spa-Francorchamps with a stunningly brave wet-weather move on Franco Colapinto into Eau Rouge.

Mercedes had seen enough and, shortly after Antonelli’s 18th birthday, the squad announced at the Italian Grand Prix that the home favourite would indeed be replacing seven-time world champion Hamilton at the Silver Arrows.

Tough shoes to fill, but despite some mid-season blips in form, Antonelli’s rookie season included three podiums and 150 points – more than enough to ensure his Formula 1 future looks brighter than ever.'`,
        leclerc: `Born in the Mediterranean idyll of Monaco, Leclerc arrived in F1 on a tidal wave of expectation.

Practically peerless on his way to the GP3 and Formula 2 crowns, he showcased a dazzling array of skills from scorching pole positions, commanding victories – even when his car caught fire twice at Silverstone – to an ability to muscle his way through the pack. Winning back-to-back championships also taught Leclerc how to handle pressure, another useful tool in the big pond of Formula 1 racing.

Stepping up to F1 in 2018, Leclerc showed flashes of ballistic pace on Saturdays and racing brilliance on Sundays, dragging his Sauber beyond its limits – and earning himself a money-can’t-buy race seat at Ferrari for 2019, stepping into the shoes of the Scuderia’s last world champion, Kimi Raikkonen.

There he immediately put the cat among the proverbial pigeons, unafraid to go wheel-to-wheel with established number one, Sebastian Vettel. A maiden F1 victory at Spa was followed by another a week later on Ferrari’s hallowed home turf of Monza. The tifosi had found another new hero – who then became the first man to out-score Vettel over a season with the Scuderia, a feat he repeated in crushing fashion the following year.

The 2020 and ’21 seasons bore little fruit for Ferrari, but Leclerc maintained his resolve to emerge a true title contender in 2022. With three wins, 11 podiums and nine pole positions, he was the only man able to consistently take the fight to champion Max Verstappen - a feat he and the Scuderia have sadly been unable to repeat in recent campaigns.

Out of the car, Leclerc is modest and thoughtful - but then he is on his own very personal mission. This firmly-established Formula 1 superstar is racing for his late father Herve and his friend and mentor Jules Bianchi, the F1 driver who died in 2015.

On the evidence so far, he is doing them both proud.`,
        hamilton: `‘Still I Rise’ – these are the words emblazoned across the back of Lewis Hamilton’s helmet and tattooed across his shoulders, and ever since annihilating expectations with one of the greatest rookie performances in F1 history in 2007, that’s pretty much all he’s done.

In a stellar Formula 1 career spanning spells with McLaren, Mercedes and Ferrari, Hamilton has risen to the top of the all-time pole positions list ahead of his hero Ayrton Senna, surged into first place in the wins column surpassing the inimitable Michael Schumacher, and matched the legendary German’s seven world titles.

Is he the G.O.A.T? Few would deny that he’s in the conversation – and what’s more he’s got there his way, twinning his relentless speed with a refusal to conform to stereotypes for how a racing driver should think, dress or behave.

Respect is hard earned in F1, but Hamilton – Sir Lewis Hamilton to be precise – has it from every one of his peers. Why? Because they know that whatever the track, whatever the conditions, whatever the situation, when his visor goes down and the lights go out, it’s Hammertime.

Yes, he may now be in the most challenging phase of his Formula 1 journey – a tough first season with Ferrari was his first not to feature a Grand Prix podium appearance – but few doubt Hamilton still has more to add to the F1 history books.`,
        norris: `Lando Norris may not be named after Star Wars rebel Lando Calrissian - his Mum just liked the moniker - but the 2025 World Champion has flair and fighting spirit in bountiful supply.

McLaren had the British teenager on their books for two years before fast-tracking him into F1’s galaxy of stars in 2019. A firecracker in his junior career, with a penchant for pole positions and wheel-to-wheel tussles, Norris didn’t let them down.

Paired with the highly-rated – and far more experienced – Carlos Sainz, his rookie season was impressive, Norris edging the Spaniard in their head-to-head qualifying battle, scoring points 11 times, and only narrowly missing out on a top-10 championship placing.

A maiden podium came in 2020, with more following in the subsequent two seasons – he narrowly missed out on a win at Russia 2021 – as he dominated another more senior team mate, Daniel Ricciardo, to firmly establish himself in F1’s top tier.

It was the 2024 season that finally brought Norris his breakthrough win – along with three more – as he became the biggest challenger to Max Verstappen’s drivers’ crown and led McLaren to their first constructors’ title since 1998.

He went one better the following year, winning seven times and proving wrong those who doubted his mental strength by staging a late-season comeback to overhaul a 34-point standings deficit and beat Verstappen and McLaren team mate Oscar Piastri to the Drivers' Championship.

Away from the track, Norris brims with a modest charm and an artistic side sees him design and paint his own race gear as a hobby. The focus for the future is allying artistry and ambition on track, as McLaren rely on him to help keep them on top for 2026's era of new technical regulations.

Norris hopes the downforce will be with him…`,
        piastri: `Born in Melbourne, just a stone’s throw away from the Australian Grand Prix venue, a young Oscar Piastri’s dreams of one day racing in Formula 1 were ignited by the sport’s star drivers roaring around his local streets, otherwise known as Albert Park.

But it would take huge commitment and sacrifice to turn that dream into a reality, with a move to Europe – made by the likes of fellow countrymen Mark Webber and Daniel Ricciardo before him – the only way to go up against the best and catch the attention of the sport’s decision-makers.

Using success on the Australian karting scene as a springboard, Piastri continued to learn the craft in championships across Europe, before getting his first taste of single-seater competition as a 15-year-old – two podium finishes in F4 UAE a sign of things to come.

From there, success flowed. British F4 runner-up. Formula Renault champion. F3 champion. F2 champion (by more than 50 points). Piastri did not simply climb the junior single-seater ladder, he charged up it to knock loudly on the F1 door.

So impressive was Piastri that two F1 teams squabbled over his services for 2023, adding a new dimension to the driver market and so-called ‘silly season’. McLaren, and not long-time backers Alpine, won out and their rookie repaid them in spades, taking two podiums in a highly impressive debut campaign.

It was no flash in the pan. In 2024 Piastri proved vital in McLaren securing their first constructors' title since 1998, pushing more experienced team mate Lando Norris all the way and scoring Grand Prix wins in Hungary and Azerbaijan to finish fourth in the driver standings.

The upward trajectory continued in 2025, Piastri emerging as a genuine title contender in only his third year of F1 competition. He led the standings for much of the campaign, winning seven Grands Prix, before a late-season lull left him trailing team mate Norris – to whom he lost out in a three-way title decider at the Abu Dhabi finale.

No wonder few in the paddock – particularly those at McLaren – consider the young Melburnian a World Champion in the making.`,
        verstappen: `He’s Max by name, and max by nature.

Arriving as Formula 1’s youngest ever competitor at just 17 years old, Verstappen pushed his car, his rivals and the sport’s record books to the limit. The baby-faced Dutchman with the heart of a lion took the Toro Rosso – and then the Red Bull – by the horns with his instinctive racing style.

F1’s youngest points scorer soon became its youngest race winner – at the age of 18 years and 228 days – with an opportunistic but controlled drive on debut for Red Bull in Barcelona 2016. A true wheel-to-wheel racer, another stunning drive in Brazil from the back of the pack to the podium on a treacherous wet track kept the plaudits coming.

Verstappen’s no-holds-barred attitude and hard defending have sometimes landed him in hot water with his peers and paymasters. But the mistakes that initially marred his potential have given way to maturity, while the bravado and energy that make him a blockbuster talent have remained – and the victories have kept on coming.

They led to his first F1 drivers’ crown after that now legendary, final-round showdown with Lewis Hamilton in 2021 and he followed it with a powerhouse title defence in 2022. An epic third successive championship triumph featured a record 19 wins from 23 Grands Prix, then he held on for a fourth in 2024, despite Red Bull falling off the pace towards the end of the campaign. And in 2025 he came within two points of making it five after an epic late-season comeback against the all-conquering McLarens.

The son of former F1 driver Jos Verstappen and super-quick karting Mum Sophie Kumpen, racing runs through his genes. Despite moving out of Dad’s house to live in Monaco, Verstappen remains close to his family, and though he’s not afraid to speak his mind, he can still be surprisingly shy.

Having become the Netherlands' first world champion aged just 24, the expectations for the new generation’s leading light are sky high – but with Verstappen there’s a feeling that the sky’s the limit.`,
        hadjar: `Isack Hadjar was the final rookie to be announced for the 2025 season after a dramatic winter reshuffle at Red Bull, which involved Liam Lawson replacing Sergio Perez and the French-Algerian picking up the vacant seat at Racing Bulls.

The road to F1 was quite a journey for Paris-born Hadjar, who built on early promise in karting to reach the top step of the podium during his first full season of single-seater competition and secure a top-three championship classification in his second.

With those foundational French F4 campaigns behind him, Hadjar continued the learning process in Formula Regional European and the F3 Asian series through 2021, before combining Formula Regional Asian and F3 in 2022, when he also became a member of the Red Bull Junior Team.

Fresh from claiming three race victories and finishing fourth in the F3 standings, Hadjar had hoped to kick on when he stepped up to F2 for 2023, only to end the year winless and with some question marks surrounding his future.

Red Bull stuck by the youngster, though, giving him F1 practice outings with the then-named AlphaTauri and the senior team at the Mexican and Abu Dhabi rounds respectively, before the two parties regrouped for another crack at F2.

It was a decision that paid off, with Hadjar winning four races and logging four more podium finishes to challenge new Sauber recruit Gabriel Bortoleto for the 2024 title – narrowly missing out after an agonising stall at the Yas Marina finale.

While he did not quite manage to tick the box of a championship win during his junior career, Hadjar’s eye-catching pace and racecraft all but made up for it and marked him out as the ideal candidate to slot in alongside Yuki Tsunoda.

A heartbreaking debut in Melbourne saw him fail to start after crashing out on a damp formation lap. But from there on in, Red Bull’s confidence in Hadjar’s raw talent began to pay off. By the second half of the season he was consistently reaching Q3 and at Zandvoort took his maiden podium.

He ended the year on 51 points to team mate Liam Lawson’s 38 – earning a promotion for 2026, with history repeating as he again replaced Yuki Tsunoda, this time at Red Bull Racing to partner Max Verstappen.`,
        alonso: `Michael Schumacher was the undisputed king of Formula 1 in the early 2000s, picking up wins and championships at a rate that was simply unheard of at the time. It was going to take someone very special to topple the Ferrari legend from his throne – and that it was Fernando Alonso who did it, tells you all you need to know about the Spaniard.

Fiercely competitive, Alonso is not shy about his talent, rating himself as 9/10 “in everything”, and few in the know would disagree, with his performances in F1 characterised by blistering speed, brilliant tactical thinking, exemplary race craft, a razor-sharp eye for detail and a relentless determination to win.

A serial record breaker in his early days, he was – at one time – F1’s youngest polesitter, race winner, world champion and double world champion as he gobbled up success with the Renault team. Even Alonso couldn’t continue that amazing run in his later career though, failing to add another title to his collection despite spells at McLaren and Ferrari.

But after two years away from Formula 1 racing – and with two Le Mans wins in his pocket – Alonso returned with Alpine in 2021. His speed and determination undiminished, he was back on the podium that year, but frustrated by poor reliability – and the lack of a long-term contract – the following season, he opted to jump ship once more.

After eight podiums in his first season with Aston Martin, he has since become the first man to reach 400 Grand Prix starts. And with tech legend Adrian Newey now on board too, Alonso hopes it will be with the team in green that he finally returns to winning ways, as he has unfinished business with F1…`,
        stroll: `There is no such thing as too much too soon for Stroll, a teenage sensation with a wet weather predilection. One of the cool kids on the grid, Stroll was unveiled shortly after his 18th birthday by Williams – before he finished high school and got his road licence.

Stroll meant business in his debut 2017 season, setting records on the way. An opportunistic racer he bounded onto the podium in Baku, the youngest rookie to do so. As the son of a wealthy entrepreneur, Stroll is used to a champagne lifestyle but now he knows the fizz tastes all the sweeter on the rostrum. Then in Monza he mastered the downpours to become the youngest driver in history to line up on the front row.

A single-minded starter, the Canadian loves to make up places on the opening lap and fight through to the points. Stroll has the potential to be a long-term fixture in Formula 1 – as amply illustrated by a maiden pole and another two podiums in 2020.

Those came after his father Lawrence led the consortium that took over Force India midway through the 2018 season, and then transformed it from Racing Point to Aston Martin for 2021. And with F1 legends Adrian Newey and Fernando Alonso now onboard too, the future looks bright for both the team and their young driver – and even if it rains then Stroll can keep on motoring at the sharp end of the pack.`,
        gasly: `If there’s one man who knows how big a rollercoaster ride an F1 driver’s career can be, it’s Pierre Gasly!

The flying Frenchman was called up to make his 2017 debut in Malaysia in place of Daniil Kvyat and, after proving his mettle, he was named a Toro Rosso driver the following year. A further 21 races into his fledgling career, Gasly was moved up again – this time to replace Red Bull big gun Daniel Ricciardo.

Gasly seemed to have a knack of being in the right place at the right time – a quality that’s equally handy on track. A series of impressive 2018 performances for Toro Rosso – including a brilliant fourth place in Bahrain – showed exciting promise for what he might do with the ‘A’ team in 2019.

Unfortunately that promise only appeared in flashes – and he quickly suffered from unfavourable comparisons with superstar team mate Max Verstappen. So much so that after the summer break, he was sent back to Toro Rosso, with another young up-and-comer – Alex Albon – being given a shot in the ‘senior’ Red Bull seat.

But Gasly bounced back, as only Gasly can. In the season’s remaining nine races he scored almost as many points as team mate Kvyat managed over the entire year – and secured his best-ever race result with P2 in Brazil. That trajectory continued in 2020, peaking with an emotional maiden win at the renamed AlphaTauri team’s home race in Italy, and didn’t let up in 2021 when he was back on the podium and scored 110 of the squad’s 142 points.

When AlphaTauri’s momentum stalled in 2022, Gasly decided it was time for a change – in the form of French squad Alpine. It’s a move that has occasionally put him back on the podium, but the question now is can he gather momentum and get himself another shot at the F1 bigtime…`,
        colapinto: `He may have only contested a handful of Grands Prix, but Alpine racer Franco Colapinto has already made quite a name for himself in Formula 1, having not once but twice been drafted in mid-season to replace a struggling team mate.

At the end of August 2024, Williams announced that their academy driver and then F2 racer Colapinto would contest the remainder of the 2024 season with the squad, replacing Logan Sargeant as Alex Albon’s team mate.

A race winner in an array of categories on the junior single-seater scene, Colapinto had joined the Williams Racing Driver Academy in early 2023 and made his FP1 debut with the F1 team at last year’s British Grand Prix – giving him an initial taste of the FW46.

On his subsequent race debut at Monza, he became the first Argentine driver in F1 for 23 years, after Gaston Mazzacane’s last appearances for Prost back in 2001, and only the second Argentine to drive for Williams, following on from his countryman Carlos Reutemann.

Despite his obvious speed, Williams' signing of Carlos Sainz meant Colapinto was left without a full-time seat for 2025 and swapped to Alpine as reserve. But he didn’t have to wait long to be back on the grid, replacing rookie Jack Doohan from round seven onwards and then retaining the drive for 2026.`,
        albon: `Born in London but racing under the flag of Thailand, Alexander Albon’s first word was in fact Italian. That word was Ferrari – though it was with another Italian team that he got his big F1 break.

Idolising Michael Schumacher and dreaming of one day racing in Formula 1, the junior Albon was pipped to the 2016 GP3 title by a certain Charles Leclerc. He then left his great friendship with George Russell trackside as he took the 2018 Formula 2 title fight down to the wire.

Graduating to the F1 big league along with yet another contemporary – Lando Norris – in 2019, Albon did his talking on track with Toro Rosso in the opening races, earning a mid-season promotion to Red Bull Racing.

A stylish overtaker with a championship mentality, Albon was unfazed by partnering Max Verstappen for the second half of his rookie season, taking top-six finishes in eight of his nine 2019 races with Red Bull.

Staying in touch with the future champion proved tougher in 2020 and Red Bull dropped him from their race line-up. Crucially, though, Albon was retained as test and reserve driver, keeping him very much on team bosses’ radar, leading to his 2022 return to the grid with Williams, where he has established a reputation as a fast qualifier and mature racer.

Laidback and cheerful with a cheeky grin, the Thai driver is popular among his peers – not always easy in motorsport’s cauldron of competition – but you don’t succeed in Formula 1 by being popular. Albon’s challenge remains a big one – to make the most of a rare second F1 opportunity.`,
        sainz: `He’s the matador from Madrid racing royalty.

After entering F1’s Bull Ring paired alongside Max Verstappen at Toro Rosso in 2015, Sainz quickly showed his fighting spirit. A tenacious racer, he puts the car on the edge as he hustles his way through the pack. No wonder Sainz has earned the nickname Chilli.

But the Spaniard is intelligent as well as instinctive, thinking his way through a race and into the points. This calm temperament follows him off track where he remains unfazed by the pressures of forging a Grand Prix career with a famous name.

Sainz is the son of double World Rally champion, also his namesake, and has brought some of Dad’s driving skills to the F1 circuit – junior loves a delicious dose of drift for one.

After following in his famous father’s tyre tracks, Sainz has had big racing boots to fill – first at McLaren where he replaced his childhood hero Fernando Alonso, and then at Ferrari, in the seat formerly owned by Sebastian Vettel.

It is never easy living in the shadow of sporting giants, but Sainz has shown the drive and disposition to deal with it, scoring four Grand Prix victories during his time with the Scuderia before moving to Williams and putting them back on the podium. Vamos!`,
        lawson: `Liam Lawson knows a thing or two about jumping in at the deep end.

A race winner at pretty much every level of junior motorsport, and a front-runner in the highly competitive F3 and F2 championships, the New Zealander was keenly awaiting his F1 chance as Red Bull’s reserve driver when a twist of fate presented it.

With AlphaTauri racer Daniel Ricciardo breaking his hand in a practice crash at the 2023 Dutch Grand Prix, Lawson – inspired as a youngster by the Lightning McQueen character from the Disney animation Cars – was ready to strike.

After a sink-or-swim debut in the relentless rain at Zandvoort, the entire paddock stood up and took notice amid the intense humidity of Singapore, where the rookie brilliantly beat world champion Max Verstappen to a Q3 spot and bagged some valuable points on race day.

Red Bull told Lawson just before his stellar qualifying run under the Marina Bay lights that there would be no room at the inn for 2024, with a rebranded RB team combining experience and youth once more in the healed Ricciardo and Yuki Tsunoda.

Lawson had been in this position before, though. He underlined his talents to Red Bull’s chiefs when it mattered most and just needed to wait for the next opportunity to arise.

Of all the places for it to unfold, Singapore triggered a second twist of fate. Ricciardo would be out, and Lawson back in, this time as Red Bull tried to understand the “bigger picture” with their driver line-ups for 2025 and beyond.

It marked a golden opportunity for Lawson to not only cement himself in RB colours, but also knock on the door of a Red Bull promotion - which is exactly what he got, when he was announced as Sergio Perez's replacement as Max Verstappen's team mate for 2025.

However, the whirlwind nature of his F1 career continued, and after just two difficult Grands Prix with the senior squad, Lawson found himself back at Racing Bulls. But unperturbed by the rapid ‘demotion’, the Kiwi racer quickly rebuilt his reputation and has been a fixture on the grid ever since.`,
        lindblad: `The sole rookie on the 2026 grid, Arvid Lindblad is the latest Red Bull protégé to get his shot at the F1 bigtime following the rapid promotion of his Racing Bulls predecessor Isack Hadjar.

British teenager Lindblad (the name, like his father, is Swedish) has made plenty of waves in the junior ranks in recent seasons, becoming the youngest ever race winner in both Formula 3 and Formula 2, aged just 16 and 17 respectively.

That followed success in national and international karting, including winning the prestigious WSK Euro Series – joining the likes of Charles Leclerc and Kimi Antonelli – in 2021, his first full year of competition as part of Red Bull’s junior programme.

And after impressing the likes of Laurent Mekies and Helmut Marko in Testing of Previous Car (TPC) runs with Red Bull in 2025 – as well as two FP1 appearances for the team – Lindblad has now been given his chance to race in the top echelon.`,
        ocon: `If there’s one word that dominates Esteban Ocon’s career, it’s ‘sacrifice’.

Back when he was just a promising karter, Ocon’s parents sold their house, put their jobs on hold, and began a life on the road, living in a caravan and travelling from circuit to circuit to support their son’s burgeoning career.

Sacrifice, see – but it worked. 2014 saw Ocon break through in the world of single-seaters, as he beat a certain Max Verstappen to the European F3 title. Backed by Mercedes, he won the GP3 title the following year and was halfway through a season of DTM in 2016 when he was offered the chance to replace Rio Haryanto at the minnow Manor team from the Belgian Grand Prix onwards.

That opportunity led to a full-time seat the following year with Force India, where his wheel-to-wheel duels with highly-rated team mate Sergio Perez quickly marked him out as a rising star. But when Lawrence Stroll, father of racer Lance, stepped in midway through 2018 to secure the squad’s financial future, the writing was on the wall for Ocon, who was moved aside at the end of the year to allow Stroll Jnr to join from Williams.

Ocon bided his time, though, and after a year on the sidelines as Mercedes’ reserve driver, he found his way back into a race seat for 2020 with Renault, who became Alpine for 2021 – when his wait finally paid off, as he scored his and the famous French marque’s first F1 win.

A move to Haas for 2025 marked the start of another new challenge, but then nothing in Ocon’s motorsport career has come easy – and if he has managed to return to the F1 grid and step atop the podium, it’s through a combination of self-belief, determination and a talent that’s up there with the very best.`,
        bearman: `As an official Ferrari reserve he made his F1 race debut in Saudi Arabia 2024 in place of the ill Carlos Sainz.

That was after the young Bearman had got his first taste of F1 machinery with the Scuderia towards the end of 2023, in preparation for a pair of FP1 outings for Haas at the Mexican and Abu Dhabi Grands Prix.

He would go on to complete several more F1 test runs whilst also competing in F2 with the Prema Racing team, winning four races and placing sixth in the feeder series standings that year.

After a tough start to the 2024 campaign for Prema in Bahrain, Bearman struck back to claim pole position at the high-speed Jeddah track but, with Sainz-subbing duties calling, he was required to temporarily drop his F2 commitments.

Not that he was complaining - a stunning performance saw the young Englishman score six points for seventh place in his first Grand Prix, enhancing his future F1 prospects no end.

Indeed, that drive helped him secure a full-time F1 seat with the Ferrari-powered Haas squad for 2025 – as well as an early Grand Prix debut with them in Azerbaijan ’24, as team regular Kevin Magnussen served out a one-race ban.

And after taking the best result of the American team’s ’25 campaign with a fourth place in Mexico – as well as outscoring the highly-experienced Esteban Ocon on the other side of the garage – Bearman still has the ultimate Ferrari prize firmly in his sights.`,
        hulkenberg: `He’s the Superhero with the talent to become a racing superstar – if only he could get to flex his muscles with a top team. F1’s 'Hulk' has shown incredible strength and stamina as a midfield marauder for Williams, Force India, Sauber, Renault, Racing Point, Aston Martin, Haas and Kick Sauber during a career spanning back to 2010.

In that rookie season, Hulkenberg mastered changing track conditions to take a brilliant pole position in Brazil, showing he had brains as well as brawn. Since then his ability to consistently hoover up the points has made him a highly valued team player. In 2015, his reputation grew once more when, on a weekend away from his day job, he won the classic Le Mans 24 Hours race for Porsche at the first time of asking.

Hulkenberg’s off-track alter ego is down to earth – he’s the sort of driver who holds his own umbrella when it’s raining on the way to the grid – with a cheeky sense of humour. When he reached the unwanted record of most race starts without a podium finish he laughed it off as the start of the 'Hulkenberg era'.

Thankfully, even after being dropped by Renault at the end of 2019, the popular German’s era continued with some stand-in (and stand-out) drives in 2020 and 2022, and after landing a full-time F1 return with Haas for 2023, the ‘Hulk’ embraced another chance to set the record straight and hasn't left the grid since.

Pairing up with rookie Gabriel Bortoleto at Kick Sauber for 2025, Hulkenberg saw the team that becomes the Audi works squad for 2026 finally bring him that elusive first F1 podium – and now he wants more.`,
        bortoleto: `Gabriel Bortoleto is among the bright young stars of Formula 1, the former F2 champion also carrying the hopes of a nation as the first Brazilian to compete in the sport full-time since Felipe Massa in 2017.

Born in Sao Paulo, Bortoleto was karting aged seven and soon winning local championships. Four years later he was winging his way to Europe to follow in the footsteps of hero Ayrton Senna, achieving international karting success and paving the way for a move to single-seaters.

Since then, he has won races in almost every category he has contested, initially building his experience in Italian F4 and Formula Regional through 2021 and 2022, and doing enough to be signed by Fernando Alonso’s A14 management company.

With the two-time World Champion in his corner, Bortoleto moved up a gear, brilliantly capturing back-to-back F3 and F2 titles in 2023 and 2024, the latter including a remarkable rise from last to first during the Monza Feature Race – a performance that made him an outside contender for one of the few vacancies on the 2025 F1 grid.

With their own race line-up locked in, McLaren agreed to release Bortoleto from his driver development deal with the team and whispers of a race seat with Kick Sauber – following a company-wide evaluation by new boss Mattia Binotto – soon turned into concrete news.

Racing alongside the experienced Nico Hulkenberg, his rookie season featured the low of a crash-strewn home Grand Prix weekend, but also the highs of five top-10 finishes – more than enough to convince new team owners Audi to retain him for their first F1 campaign as a works squad in 2026.`,
        perez: `He’s the fighter with a gentle touch from the land of the Lucha Libre.

Perez’s reputation in F1 has been built on opposite approaches to Grand Prix racing. On the one hand, a punchy combatant who wrestles his way through the pack and into the points. Never afraid to add a bit of spice to his on-track encounters, even his team mates have been known to feel the Mexican’s heat.

On the other hand, Perez is a smooth operator, a master at managing tyres to eke out extra performance and give him the advantage on strategy. A firm favourite on the grid after his time with Sauber, McLaren, Force India, Racing Point and Red Bull, Perez is respected as an analytical racer and team player.

A proud countryman, Perez has amassed more points than any other Mexican in F1 history. In Sakhir 2020 he also matched hero and compatriot Pedro Rodriguez by taking the chequered flag first – a performance that landed him a seat with title contenders Red Bull, where he would play a supporting role to Max Verstappen’s championship-winning campaigns whilst adding a further five victories to his personal tally.

Now, after a year on the sidelines, Perez is back with the all-new Cadillac team – with the similarly-experienced Valtteri Bottas alongside as his team mate. After living in the mighty Verstappen’s shadow for so long, this is his chance to shine once more.`,
        bottas: `Learning his craft on Finnish roads of ice and snow, Bottas was born to be a Grand Prix racer.

Bottas explains that if you can drive on the frozen roads of his homeland then you can drive anywhere. Then there’s the Finnish mentality –reserved, diligent and calm, the fast lane of F1 doesn’t faze him.

Making his F1 debut with Williams in 2013, Bottas soon became part of the family. Points and podiums followed with the reliable racer even amassing the most points without a win, a record he resented but that showcased his ability. The fact the Finn was such a points machine saw him suddenly promoted to the most coveted seat in F1 - Nico Rosberg’s vacant championship-winning seat at Mercedes.

Bottas blossomed at the Silver Arrows in 2017, unleashing his pace to clock up personal pole positions and victories as well as a team championship for the famous Mercedes marque alongside Lewis Hamilton. He even tied with Hamilton and Sebastian Vettel with 13 podiums.

For a shy guy, it brought a confidence boost and a new swagger – albeit in a very demur Finnish fashion. He would need all that confidence in 2018 – a season Bottas described as his worst in F1, as he took zero wins to Hamilton’s 11. That, though, was as much a reflection of his team mate’s brilliance.

Bottas stepped it up a level in 2019, four victories securing a convincing second in the championship behind Hamilton, but that dropped to two wins to his team mate's 11 in 2020 and then just one in 2021, prompting Mercedes to drop him after five seasons.

In 2022 he started a new chapter in his F1 career, replacing compatriot Kimi Raikkonen to lead an all-new line-up at Alfa Romeo, later Kick Sauber, and taking Chinese rookie Zhou Guanyu under his wing. But after a promising start, the team’s form faltered over subsequent seasons and for 2025 Bottas found himself back at Mercedes in a reserve role.

But the Bottas story was far from over. A driver of his experience and speed would be invaluable to an all-new Formula 1 team – one like Cadillac, for example, debutantes on the 2026 grid and with whom the Finn makes his competitive comeback alongside fellow F1 returnee Sergio Perez.`,
    };

    const TEAM_PROFILES = {
        mercedes: `Mercedes' modern F1 revival started with the creation of a works squad for 2010 - the platform for a meteoric rise up the Grand Prix order. The team generated huge excitement from the off with the sensational return of Michael Schumacher, but headlines soon followed on track: three podiums in their debut season, all via Nico Rosberg - who then claimed a breakthrough pole/victory double at China in 2012.

The following season he was paired with Lewis Hamilton, the duo going on to stage some epic title battles as the Silver Arrows swept all before them to become one of the most dominant forces of the modern F1 era - until Red Bull came and stole that crown. Nevertheless, with proven race-winner George Russell now partnered by rising star Kimi Antonelli, Mercedes remain very much one of the teams to beat...

2025

George Russell ably assumes the role of team leader, winning twice as the team climb back to second in the standings, defeating all bar the unstoppable McLaren. Kimi Antonelli's rookie campaign is rocky at times, but he finds his footing to make the podium three times.

2024

Fall to fourth overall despite two wins apiece for George Russell and Lewis Hamilton in the rather inconsistent W15. Season starts with shock announcement that Hamilton is to depart for Ferrari at the end of the year.`,
        ferrari: `For many, Ferrari and Formula 1 racing have become inseparable. The only team to have competed in every season since the world championship began, the Prancing Horse has grown from the humble dream of founder Enzo Ferrari to become one of the most iconic and recognised brands in the world. Success came quickly through the likes of Alberto Ascari and John Surtees, and continued – in amongst leaner times – with Niki Lauda in the 1970s and then Michael Schumacher in the 2000s, when Ferrari claimed a then unprecedented five consecutive title doubles, securing their status as the most successful and decorated team in F1 history...

2025

The SF-25 proves a hard car to master, particularly for new arrival Lewis Hamilton, who wins the China Sprint but otherwise fails to trouble the podium. Charles Leclerc does make it seven times, but the team are never title contenders and drop to fourth overall.

2024

Team Principal Fred Vasseur’s leadership starts to gel and strong campaign sees Charles Leclerc and Carlos Sainz take five wins between them. Runners-up in the constructors’ standings, losing out to McLaren at the final round. Lewis Hamilton signed to replace Sainz for 2025.`,
        mclaren: `Since entering the sport in 1966 under the guidance and restless endeavour of eponymous founder Bruce, McLaren's success has been nothing short of breathtaking. Five glittering decades have yielded countless victories, pole positions and podiums, not to mention 10 constructors' championships. What's more, some of the sport's greatest drivers made their names with the team, including Emerson Fittipaldi, Ayrton Senna, Mika Hakkinen and Lewis Hamilton...

2025

Immediately the team to beat and tie up constructors’ title honours with six rounds to spare. Lando Norris and Oscar Piastri duke it out for the drivers’ crown, winning seven races apiece, with the former ultimately victorious, fending off a late-season charge from Max Verstappen.

2024

Rise back to the top to clinch first constructors’ championship since 1998, despite Red Bull dominating first half of season. Lando Norris is runner-up in driver standings after four wins, with Oscar Piastri adding another two victories.`,
        red_bull: `Red Bull were no strangers to F1 - as sponsors - prior to formally entering as a works team in 2004. Nonetheless, the scale of their success over the following decade was staggering. After a first podium in 2006, the team hit their stride in 2009, claiming six victories and second in the constructors' standings. Over the next four seasons they were a tour de force, claiming consecutive title doubles between 2010 and 2013, with Sebastian Vettel emerging as the sport's youngest quadruple champion. Now they are recapturing that glory with an equally exciting talent – one named Max Verstappen…

2025

Tough start to the year culminates in Christian Horner’s exit, replaced as Team Principal by Racing Bulls counterpart Laurent Mekies. Max Verstappen leads strong recovery, winning six of the last nine Grands Prix, but narrowly fails to retain his crown as squad again finish third.

2024

Max Verstappen takes seven wins from first 10 races, but none from next 10 en route to a fourth straight drivers’ crown, with 437 points. Sergio Perez scores just 152 and team drop to third overall behind McLaren and Ferrari, as long-time design chief Adrian Newey signs for Aston Martin.`,
        aston_martin: `Aston Martin’s original Formula 1 foray – over half a century ago – lasted just five races. This time, though, it’s serious. This F1 squad are no strangers to success, having won in their original guise of Jordan and most recently as Racing Point in 2020. Renowned for their ability to punch above their weight, and now with a two-time champion leading their driver line-up - and F1's most famous designer onboard since 2025 - Aston Martin are very much a team to watch…

2025

With the newly-arrived Adrian Newey focussed on 2026 and its new regulations, drop to P7 overall amid a tight midfield battle. A fifth for Fernando Alonso in Hungary is the closest they come to a podium. Newey to become Team Principal for ’26 season.

2024

Disappointing campaign yields zero podiums and another P5 in the constructor standings, as Technical Director Dan Fallows departs mid-season. Fernando Alonso leads limited points haul – 70 to Lance Stroll’s 24 – with best result a fifth in Saudi Arabia. Adrian Newey signed for 2025.`,
        alpine: `Alpine may be a relatively new name to Formula 1, but Renault’s famous sportscar arm has plenty of motorsport heritage. The 2021 rebrand of the team marked the next step in Renault’s F1 revival, begun in 2016 with the takeover of the then-Lotus squad. Already race winners in their new guise, regular podiums and a tilt at the title must be their next target…

2025

Flavio Briatore takes the helm following Oli Oakes mid-season departure but cannot prevent a slump to last in the standings, despite some heroic drives from Pierre Gasly, who scores all of the team’s 22 points. Announce move to Mercedes power for 2026.

2024

Another season of change sees F1 veteran Flavio Briatore join in advisory role and Oli Oakes replace Bruno Famin as Team Principal. Poor form slowly improves and surprise double podium for Esteban Ocon and Pierre Gasly in Brazil lifts squad to an unexpected P6 in the final standings.`,
        williams: `Driven on by the brilliance and passion of the late Sir Frank Williams, Williams grew from humble beginnings to become a Formula 1 behemoth, unrivalled by all except Ferrari and McLaren in terms of enduring success. Over the past four decades the team has racked up Grand Prix wins and championship glory, and in the process nurtured some of the greatest talents in the sport, both in and out the cockpit. And, following the Williams family's decision to step aside after the 2020 sale of the team to Dorilton Capital, a new era has begun...

2025

Long-term recovery plans start to pay off, as team climb to a strong P5 in the standings, scoring 120 points more than in 2024. New recruit Carlos Sainz takes a while to acclimatize, but then scores two podiums in the season’s second half.

2024

Tough campaign sees a drop to ninth overall, with several heavy crashes hampering the final races. Rookie Franco Colapinto proves a sensation after replacing Logan Sargeant mid-season, but biggest news is signing of Carlos Sainz as Alex Albon’s team mate for 2025.`,
        rb: `Established in 2006 as a squad in which young drivers from Red Bull’s prodigious talent pool could cut their F1 teeth, Racing Bulls – originally named Toro Rosso, then AlphaTauri, then RB – were formed from the ashes of the plucky Minardi team. Sebastian Vettel gave validity to the approach almost immediately, delivering a fairy-tale win in 2008, before going on to enjoy world championship success with parent team Red Bull Racing. Today the ethos of nurturing talent still holds true, though the Italian squad are no longer simply a ‘B team’ but a constructor in their own right...

2025

Upward trajectory continues, improving to P6 in standings. Alan Permane takes the reins as Team Principal when Laurent Mekies gets called up to Red Bull Racing, and star rookie Isack Hadjar puts them back on the podium for the first time in five years with third place at Zandvoort.

2024

First season as RB under leadership of new Team Principal Laurent Mekies brings another P8 in the championship, but with almost twice the points of 2023. Most are scored by Yuki Tsunoda, as a struggling Daniel Ricciardo is replaced with Liam Lawson for the final six rounds.`,
        haas: `Haas made their highly impressive debut in 2016, and in the process became the first all-American-led F1 squad in three decades. Founded by industrialist Gene Haas, they are based in the United States on the same Kannapolis, North Carolina facility as his championship-winning NASCAR Sprint Cup Series team, Stewart-Haas Racing. The Ferrari-powered team also have a UK factory in Banbury…

2025

Score significantly more points than in ’24 but drop two places to P8 overall amid a tight midfield battle. Rookie Oliver Bearman – paired with the experienced Esteban Ocon – proves a sensation, taking team’s best result of the year with a fourth place in Mexico.

2024

Bounce back to a P7 championship finish under new Team Principal Ayao Komatsu, with both Nico Hulkenberg and Kevin Magnussen scoring regularly, the former qualifying a spectacular fourth in Abu Dhabi. New driver line-up of Esteban Ocon and Oliver Bearman announced for 2025.`,
        audi: `Given Audi’s decades of success in global motorsport, it’s hard to believe that 2026 marks the famous German marque’s first foray into Formula 1. Having announced plans to become a power unit supplier back in 2022, their hunger to compete quickly grew – resulting in the acquisition of the Sauber team, now the first-ever Audi works squad.

Ex-Ferrari team chief Mattia Binotto heads up the project, while former Red Bull stalwart Jonathan Wheatley is Team Principal. As for driving prowess, that comes from the tried-and-tested mix of youth and experience that is Gabriel Bortoleto and Nico Hulkenberg…

2025

Present Audi R26 Concept as a preview of the colour scheme and design of the brand’s first Formula 1 car. Revolut announced as team’s title sponsor for 2026 entry.

2024

Expand Formula 1 commitment with 100 percent takeover of Sauber and installation of former Ferrari team boss Mattia Binotto as head of F1 project. Jonathan Wheatley to exit Red Bull to become Team Principal.

2022

Audi – part of the Volkswagen Group – announce they will become an F1 engine supplier when new power unit regulations come into force in 2026. Reach agreement for Sauber team to become Audi works squad for that season.`,
        cadillac: `One of the most famous US automotive names comes to Formula 1 for 2026, as the all-new Cadillac squad make their debut as the grid’s 11th team. It’s not just their name that’s familiar – drivers Sergio Perez and Valtteri Bottas are among the most experienced in the paddock, boasting 16 GP wins and over 500 race starts between them. Team Principal Graeme Lowdon has F1 form too, with the former Marussia outfit. Engine supply comes from Ferrari, with Cadillac owners General Motors (GM) due to debut their own power unit from 2029.

2025

Gain official go-ahead for 2026 entry and team launch logo and branding at a red-carpet event at the Miami Grand Prix. GM approved as F1 power unit supplier for 2029 and American IndyCar star Colton Herta signed as test driver. Debut race line-up of Valtteri Bottas and Sergio Perez announced.

2024

Formula 1 and GM agree in principle for Cadillac to become the sport’s 11th entry and ex-Marussia chief Graeme Lowdon is made Team Principal of the squad – a joint venture with TWG Motorsports. Ferrari confirm an engine and gearbox supply deal for 2026.`,
    };

    const TEAM_DETAILS = {
        mercedes: {
            fullTeamName: 'Mercedes-AMG Petronas Formula One Team',
            base: 'Brackley, United Kingdom',
            teamChief: 'Toto Wolff',
            technicalChief: 'James Allison',
            chassis: 'W17',
            powerUnit: 'Mercedes',
            reserveDriver: 'Fred Vesti',
            firstTeamEntry: '1970',
        },
        ferrari: {
            fullTeamName: 'Scuderia Ferrari HP',
            base: 'Maranello, Italy',
            teamChief: 'Frédéric Vasseur',
            technicalChief: 'Loic Serra / Enrico Gualtieri',
            chassis: 'SF-26',
            powerUnit: 'Ferrari',
            reserveDriver: 'Antonio Giovinazzi',
            firstTeamEntry: '1950',
        },
        mclaren: {
            fullTeamName: 'McLaren Mastercard F1 Team',
            base: 'Woking, United Kingdom',
            teamChief: 'Andrea Stella',
            technicalChief: 'Peter Prodromou / Neil Houldey',
            chassis: 'MCL40',
            powerUnit: 'Mercedes',
            reserveDriver: 'Leonardo Fornaroli, Pato O’Ward',
            firstTeamEntry: '1966',
        },
        red_bull: {
            fullTeamName: 'Oracle Red Bull Racing',
            base: 'Milton Keynes, United Kingdom',
            teamChief: 'Laurent Mekies',
            technicalChief: 'Pierre Wache',
            chassis: 'RB22',
            powerUnit: 'Red Bull Ford',
            reserveDriver: '-',
            firstTeamEntry: '1997',
        },
        aston_martin: {
            fullTeamName: 'Aston Martin Aramco Formula One Team',
            base: 'Silverstone, United Kingdom',
            teamChief: 'Adrian Newey',
            technicalChief: 'Enrico Cardile',
            chassis: 'AMR26',
            powerUnit: 'Honda',
            reserveDriver: 'Jak Crawford',
            firstTeamEntry: '2018',
        },
        alpine: {
            fullTeamName: 'BWT Alpine Formula One Team',
            base: 'Enstone, United Kingdom',
            teamChief: 'Flavio Briatore',
            technicalChief: 'David Sanchez',
            chassis: 'A526',
            powerUnit: 'Mercedes',
            reserveDriver: 'Jack Doohan, Paul Aron, Kush Maini',
            firstTeamEntry: '1986',
        },
        williams: {
            fullTeamName: 'Atlassian Williams F1 Team',
            base: 'Grove, United Kingdom',
            teamChief: 'James Vowles',
            technicalChief: 'Pat Fry',
            chassis: 'FW48',
            powerUnit: 'Mercedes',
            reserveDriver: '-',
            firstTeamEntry: '1978',
        },
        rb: {
            fullTeamName: 'Visa Cash App Racing Bulls Formula One Team',
            base: 'Faenza, Italy',
            teamChief: 'Alan Permane',
            technicalChief: 'Tim Goss',
            chassis: 'VCARB 03',
            powerUnit: 'Red Bull Ford',
            reserveDriver: 'Yuki Tsunoda',
            firstTeamEntry: '1985',
        },
        haas: {
            fullTeamName: 'TGR Haas F1 Team',
            base: 'Kannapolis, United States',
            teamChief: 'Ayao Komatsu',
            technicalChief: 'Andrea De Zordo',
            chassis: 'VF-26',
            powerUnit: 'Ferrari',
            reserveDriver: 'Ryo Hirakawa',
            firstTeamEntry: '2016',
        },
        audi: {
            fullTeamName: 'Audi Revolut F1 Team',
            base: 'Hinwil, Switzerland',
            teamChief: 'Jonathan Wheatley',
            technicalChief: 'James Key',
            chassis: 'R26',
            powerUnit: 'Audi',
            reserveDriver: '-',
            firstTeamEntry: '2026',
        },
        cadillac: {
            fullTeamName: 'Cadillac Formula 1 Team',
            base: 'Silverstone, United Kingdom',
            teamChief: 'Graeme Lowdon',
            technicalChief: 'Nick Chester',
            chassis: 'MAC-26',
            powerUnit: 'Ferrari',
            reserveDriver: 'Zhou Guanyu',
            firstTeamEntry: '2026',
        },
    };

    function normalizeDriverKey(driverId, familyName) {
        const idKey = F1API.normalizeStr(driverId);
        const familyKey = F1API.normalizeStr(familyName);

        if (familyKey && (DRIVER_BIOGRAPHIES[familyKey] || Object.prototype.hasOwnProperty.call(DRIVER_IMAGE_LINKS, familyKey))) {
            return familyKey;
        }

        if (idKey) {
            const fromId = Object.keys(DRIVER_BIOGRAPHIES).find((k) => idKey.endsWith(k) || idKey.includes(k));
            if (fromId) return fromId;
        }

        return familyKey || idKey || '';
    }

    function driverProfilePhotoURL(driver, enriched, key) {
        const custom = DRIVER_IMAGE_LINKS[key];
        if (custom) return custom;
        return getDriverHeadshotHiRes(driver?.givenName, driver?.familyName, enriched, driver?.permanentNumber)
            || getDriverHeadshot(driver?.givenName, driver?.familyName, enriched, driver?.permanentNumber)
            || '';
    }

    function teamProfilePhotoURL(teamId) {
        const custom = TEAM_IMAGE_LINKS[teamId];
        if (custom) return custom;
        return getTeamCarUrl(teamId) || getTeamLogoUrl(teamId) || '';
    }

    function getDriverBio(key, fallbackName) {
        return DRIVER_BIOGRAPHIES[key]
            || `${fallbackName || 'This driver'} competes in Formula 1 with a focus on race execution, adaptation, and points-scoring consistency.`;
    }

    function getTeamProfile(teamId, fallbackName) {
        return TEAM_PROFILES[teamId]
            || `${fallbackName || 'This team'} continues building performance through focused development and disciplined race operations.`;
    }

    function getDriverOfficialUrl(key) {
        return DRIVER_PROFILE_URLS[key] || '';
    }

    function getTeamOfficialUrl(teamId) {
        return TEAM_PROFILE_URLS[teamId] || '';
    }

    function getDriverProfileFraming(driverKey) {
        return DRIVER_PROFILE_FRAMING[driverKey] || '50% 2%';
    }

    function getTeamBrandGradient(teamId) {
        return TEAM_BRAND_GRADIENTS[teamId] || { top: '#ff3f35', mid: '#8f1713', bottom: '#350808' };
    }

    function getDriverHeroFraming(driverKey) {
        return DRIVER_HERO_FRAMING[driverKey] || '80% 100%';
    }

    function getDriverQuote(driverKey, fallbackName, teamName) {
        const quote = DRIVER_QUOTES[driverKey];
        if (quote?.quote) return quote;
        return {
            quote: `${fallbackName || 'This driver'} keeps ${teamName || 'the team'} pushing for every millisecond, every lap, and every race weekend.`,
            by: `${teamName || 'Team'} Garage`,
        };
    }

    function getTeamDetails(teamId, fallbackName) {
        const details = TEAM_DETAILS[teamId];
        if (details) return details;
        return {
            fullTeamName: fallbackName || 'Formula 1 Team',
            base: 'Updating',
            teamChief: 'Updating',
            technicalChief: 'Updating',
            chassis: 'Updating',
            powerUnit: 'Updating',
            reserveDriver: 'Updating',
            firstTeamEntry: 'Updating',
        };
    }

    function deriveDriverImageVariants(primaryUrl) {
        if (!primaryUrl) return [];
        const variants = [primaryUrl];

        if (primaryUrl.includes('w_')) {
            variants.push(primaryUrl.replace(/w_\d+/, 'w_1600'));
            variants.push(primaryUrl.replace(/w_\d+/, 'w_1200'));
            variants.push(primaryUrl.replace(/w_\d+/, 'w_980'));
            variants.push(primaryUrl.replace(/w_\d+/, 'w_720'));
            variants.push(primaryUrl.replace(/w_\d+/, 'w_540'));
        }

        if (primaryUrl.includes('q_auto')) {
            variants.push(primaryUrl.replace('q_auto', 'q_auto:best'));
        }

        return variants;
    }

    function deriveTeamImageVariants(primaryUrl) {
        if (!primaryUrl) return [];
        const variants = [primaryUrl];

        if (primaryUrl.includes('h_')) {
            variants.push(primaryUrl.replace(/h_\d+/, 'h_420'));
            variants.push(primaryUrl.replace(/h_\d+/, 'h_320'));
        }

        if (primaryUrl.includes('q_auto')) {
            variants.push(primaryUrl.replace('q_auto', 'q_auto:best'));
        }

        return variants;
    }

    function dedupeUrls(urls) {
        const seen = new Set();
        return urls.filter((u) => {
            const k = String(u || '').trim();
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }

    function getDriverGallerySlots(driver, enriched, key) {
        const primary = driverProfilePhotoURL(driver, enriched, key);
        const auto = dedupeUrls([
            ...deriveDriverImageVariants(primary),
            getDriverHeadshotHiRes(driver?.givenName, driver?.familyName, enriched, driver?.permanentNumber),
            getDriverHeadshot(driver?.givenName, driver?.familyName, enriched, driver?.permanentNumber),
        ]).map((url) => ({ type: 'image', url, source: 'auto' }));

        const customSlots = (DRIVER_GALLERY_LINKS[key] || ['', '', '', '']).map((url) => {
            const clean = String(url || '').trim();
            return clean
                ? { type: 'image', url: clean, source: 'custom' }
                : { type: 'placeholder', source: 'custom' };
        });

        return [...auto.slice(0, 4), ...customSlots];
    }

    function getTeamGallerySlots(teamId) {
        const primary = teamProfilePhotoURL(teamId);
        const auto = dedupeUrls([
            ...deriveTeamImageVariants(primary),
            getTeamCarUrl(teamId),
            getTeamLogoUrl(teamId),
            teamProfilePhotoURL(teamId),
        ]).map((url) => ({ type: 'image', url, source: 'auto' }));

        const customSlots = (TEAM_GALLERY_LINKS[teamId] || ['', '', '', '']).map((url) => {
            const clean = String(url || '').trim();
            return clean
                ? { type: 'image', url: clean, source: 'custom' }
                : { type: 'placeholder', source: 'custom' };
        });

        return [...auto.slice(0, 4), ...customSlots];
    }

    return {
        DRIVER_IMAGE_LINKS,
        TEAM_IMAGE_LINKS,
        DRIVER_PROFILE_FRAMING,
        TEAM_BRAND_GRADIENTS,
        DRIVER_HERO_FRAMING,
        DRIVER_QUOTES,
        TEAM_DETAILS,
        DRIVER_GALLERY_LINKS,
        TEAM_GALLERY_LINKS,
        DRIVER_BIOGRAPHIES,
        TEAM_PROFILES,
        DRIVER_PROFILE_URLS,
        TEAM_PROFILE_URLS,
        normalizeDriverKey,
        driverProfilePhotoURL,
        teamProfilePhotoURL,
        getDriverBio,
        getTeamProfile,
        getDriverOfficialUrl,
        getTeamOfficialUrl,
        getDriverProfileFraming,
        getTeamBrandGradient,
        getDriverHeroFraming,
        getDriverQuote,
        getTeamDetails,
        getDriverGallerySlots,
        getTeamGallerySlots,
    };
})();

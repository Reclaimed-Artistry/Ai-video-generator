/**
 * Probes the Pexels CDN for every curated asset and records which rendition
 * URLs actually resolve (plus their resolution). Output: src/lib/stock-catalog.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const V = (id, title, tags, duration, creator, pageUrl, thumb, knownUrl, opts = {}) => ({
  id: `v${id}`,
  provider: "pexels",
  type: "video",
  title,
  tags,
  duration,
  creator,
  pageUrl,
  thumb,
  knownUrl,
  fps: opts.fps ?? [30],
  portrait: !!opts.portrait,
});

const P = (id, title, tags, creator, pageUrl, thumb, file) => ({
  id: `p${id}`,
  provider: "pexels",
  type: "photo",
  title,
  tags,
  creator,
  pageUrl,
  thumb,
  file,
});

const videos = [
  V(12685044, "Skyscrapers in downtown Minneapolis", ["city", "skyline", "aerial", "urban", "business", "architecture"], 10, "CityXcape", "https://www.pexels.com/video/skyscrapers-in-downtown-minneapolis-minnesota-usa-12685044/", "https://images.pexels.com/videos/12685044/downtown-downtown-minneapolis-minnesota-minnesota-usa-12685044.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/12685044/12685044-uhd_3840_2160_30fps.mp4", { fps: [30, 24] }),
  V(12294524, "Railway tracks and trees", ["railway", "nature", "travel", "train", "green"], 17, "Altaf Shah", "https://www.pexels.com/video/railway-tracks-and-trees-12294524/", "https://images.pexels.com/videos/12294524/pexels-photo-12294524.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/12294524/12294524-hd_1080_1920_60fps.mp4", { fps: [60, 30], portrait: true }),
  V(12197806, "Drone footage of the city", ["city", "drone", "aerial", "urban"], 31, "Joseph Eulo", "https://www.pexels.com/video/drone-footage-of-city-12197806/", "https://images.pexels.com/videos/12197806/pexels-photo-12197806.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/12197806/12197806-uhd_3840_2160_24fps.mp4", { fps: [24, 30] }),
  V(14203320, "Drone view of a train passing by buildings", ["train", "city", "drone", "travel"], 19, "Ash Haghighi", "https://www.pexels.com/video/drone-view-of-a-train-passing-by-the-buildings-14203320/", "https://images.pexels.com/videos/14203320/city-drone-footage-train-14203320.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/14203320/14203320-hd_1920_1080_30fps.mp4", { fps: [30] }),
  V(31879939, "Aerial view of ocean waves crashing on shore", ["ocean", "waves", "nature", "aerial", "sea", "calm"], 20, "David Pickup", "https://www.pexels.com/video/aerial-view-of-ocean-waves-crashing-on-shore-31879939/", "https://images.pexels.com/videos/31879939/pexels-photo-31879939.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/31879939/13580101_3840_2160_30fps.mp4", { fps: [30] }),
  V(33762472, "Aerial view of waves crashing on rocky beach", ["ocean", "beach", "waves", "aerial", "summer"], 33, "Malcoln Oliveira", "https://www.pexels.com/video/aerial-view-of-waves-crashing-on-rocky-beach-33762472/", "https://images.pexels.com/videos/33762472/arraial-d-ajuda-bahia-beach-brasil-33762472.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/33762472/14332845_3840_2160_60fps.mp4", { fps: [60, 30] }),
  V(12465390, "Waves crushing on rocks on sea shore", ["ocean", "rocks", "waves", "sea", "nature"], 69, "Vi Ulloa", "https://www.pexels.com/video/waves-crushing-on-rocks-on-sea-shore-12465390/", "https://images.pexels.com/videos/12465390/ocean-sea-waves-12465390.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/12465390/12465390-hd_1920_1080_60fps.mp4", { fps: [60, 30] }),
  V(6659065, "Waves rushing to the shore", ["ocean", "beach", "waves", "summer", "travel"], 28, "Fahmi Ramdhani Nugraha", "https://www.pexels.com/video/waves-rushing-to-the-shore-6659065/", "https://images.pexels.com/videos/6659065/pexels-photo-6659065.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/6659065/6659065-hd_1920_1080_25fps.mp4", { fps: [25, 30] }),
  V(34277035, "Aerial view of turquoise waves crashing on rocks", ["ocean", "turquoise", "beach", "aerial", "summer"], 13, "Frank Schrader", "https://www.pexels.com/video/aerial-view-of-turquoise-waves-crashing-on-rocks-34277035/", "https://images.pexels.com/videos/34277035/aerial-view-beach-beach-rocks-crashing-surf-34277035.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/34277035/14521324_3840_2160_24fps.mp4", { fps: [24, 30] }),
  V(8303107, "Close up drone footage of waves", ["ocean", "drone", "waves", "nature"], 20, "Mikhail Nilov", "https://www.pexels.com/video/close-up-drone-footage-of-waves-8303107/", "https://images.pexels.com/videos/8303107/pexels-photo-8303107.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/8303107/8303107-uhd_4096_2160_25fps.mp4", { fps: [25, 30] }),
  V(33248294, "Dynamic futuristic network connections animation", ["technology", "network", "animation", "abstract", "digital", "ai"], 10, "Nicola Narracci", "https://www.pexels.com/video/dynamic-futuristic-network-connections-animation-33248294/", "https://images.pexels.com/videos/33248294/pexels-photo-33248294.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/33248294/14165282_1920_1080_30fps.mp4", { fps: [30] }),
  V(12920674, "Digital animation of luminous numbers on a board", ["technology", "numbers", "animation", "data", "finance"], 10, "crazy motions", "https://www.pexels.com/video/digital-animation-of-luminous-numbers-on-a-board-12920674/", "https://images.pexels.com/videos/12920674/pexels-photo-12920674.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/12920674/12920674-hd_1920_1080_30fps.mp4", { fps: [30] }),
  V(34337855, "Abstract visualization of data flow on globe", ["technology", "globe", "data", "abstract", "network"], 10, "Nicola Narracci", "https://www.pexels.com/video/abstract-visualization-of-data-flow-on-globe-34337855/", "https://images.pexels.com/videos/34337855/pexels-photo-34337855.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/34337855/14546784_1080_1920_30fps.mp4", { fps: [30], portrait: true }),
  V(29717537, "Futuristic abstract digital connection background", ["technology", "abstract", "digital", "background", "future"], 20, "Chandresh Uike", "https://www.pexels.com/video/futuristic-abstract-digital-connection-background-29717537/", "https://images.pexels.com/videos/29717537/abstract-abstract-background-abstract-design-background-abstract-technology-background-29717537.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/29717537/12777857_3840_2160_30fps.mp4", { fps: [30] }),
  V(35062463, "Abstract glowing molecular network animation", ["technology", "molecule", "animation", "science", "abstract"], 10, "Nicola Narracci", "https://www.pexels.com/video/abstract-glowing-molecular-network-animation-35062463/", "https://images.pexels.com/videos/35062463/pexels-photo-35062463.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/35062463/14852572_1080_1920_30fps.mp4", { fps: [30], portrait: true }),
  V(35160268, "Dynamic network connections in abstract animation", ["technology", "network", "animation", "connections"], 10, "Nicola Narracci", "https://www.pexels.com/video/dynamic-network-connections-in-abstract-animation-35160268/", "https://images.pexels.com/videos/35160268/pexels-photo-35160268.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/35160268/14894369_1080_1920_30fps.mp4", { fps: [30], portrait: true }),
  V(34164175, "Smoothie preparation in cozy cafe setting", ["food", "coffee", "cafe", "smoothie", "drink"], 11, "Airam Dato-on", "https://www.pexels.com/video/smoothie-preparation-in-cozy-cafe-setting-34164175/", "https://images.pexels.com/videos/34164175/beanokio-cafe-coffee-shop-wicker-park-34164175.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/34164175/14483844_1080_1920_24fps.mp4", { fps: [24, 30], portrait: true }),
  V(25311041, "Vegan cereal with coffee and oat milk", ["food", "coffee", "breakfast", "cafe", "healthy"], 63, "Jakub Zerdzicki", "https://www.pexels.com/video/vegan-cereal-coffee-with-oat-milk-25311041/", "https://images.pexels.com/videos/25311041/barista-beverage-breakfast-cafe-25311041.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/25311041/11900460_1920_1080_25fps.mp4", { fps: [25, 30] }),
  V(6683367, "Person working on a cafeteria counter", ["food", "cafe", "counter", "service", "barista"], 10, "Kampus Production", "https://www.pexels.com/video/person-working-on-cafeteria-counter-6683367/", "https://images.pexels.com/videos/6683367/pexels-photo-6683367.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/6683367/6683367-uhd_3840_2160_25fps.mp4", { fps: [25, 30] }),
  V(39999149, "Barista preparing at cafe counter", ["coffee", "barista", "cafe", "espresso", "food"], 11, "Ahimsa - OM", "https://www.pexels.com/video/barista-preparing-at-cafe-counter-39999149/", "https://images.pexels.com/videos/39999149/pexels-photo-39999149.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/39999149/17068543_3840_2160_25fps.mp4", { fps: [25, 30] }),
  V(6201696, "Woman grinding black pepper", ["food", "cooking", "kitchen", "spice", "recipe"], 17, "Tim Douglas", "https://www.pexels.com/video/woman-grinding-black-pepper-6201696/", "https://images.pexels.com/videos/6201696/pexels-photo-6201696.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/6201696/6201696-uhd_3840_2160_24fps.mp4", { fps: [24, 30] }),
  V(12513724, "Barista preparing coffee in cafe", ["coffee", "barista", "cafe", "espresso"], 10, "Rockwell branding agency", "https://www.pexels.com/video/barista-preparing-coffee-in-cafe-12513724/", "https://images.pexels.com/videos/12513724/pexels-photo-12513724.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/12513724/12513724-hd_1080_1920_29fps.mp4", { fps: [29, 30], portrait: true }),
  V(4945115, "Couple working out at the gym", ["fitness", "gym", "workout", "training", "health"], 14, "Anastasia Shuraeva", "https://www.pexels.com/video/couple-working-out-at-the-gym-4945115/", "https://images.pexels.com/videos/4945115/barbell-beautifully-body-couple-4945115.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/4945115/4945115-uhd_4096_2160_24fps.mp4", { fps: [24, 30] }),
  V(4945121, "Person running on a treadmill", ["fitness", "treadmill", "running", "cardio", "gym"], 13, "Anastasia Shuraeva", "https://www.pexels.com/video/person-running-on-a-treadmill-4945121/", "https://images.pexels.com/videos/4945121/barbell-beautifully-body-couple-4945121.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/4945121/4945121-uhd_4096_2160_24fps.mp4", { fps: [24, 30] }),
  V(4944394, "People working out at the gym", ["fitness", "gym", "workout", "health"], 20, "Anastasia Shuraeva", "https://www.pexels.com/video/people-working-out-at-the-gym-4944394/", "https://images.pexels.com/videos/4944394/pexels-photo-4944394.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/4944394/4944394-uhd_2160_4096_24fps.mp4", { fps: [24, 30], portrait: true }),
  V(34800549, "Modern gym with people exercising on treadmills", ["fitness", "gym", "treadmill", "workout"], 7, "khezez", "https://www.pexels.com/video/modern-gym-with-people-exercising-on-treadmills-34800549/", "https://images.pexels.com/videos/34800549/pexels-photo-34800549.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/34800549/14755577_2160_3840_30fps.mp4", { fps: [30], portrait: true }),
  V(4944392, "Woman working out at the gym", ["fitness", "gym", "workout", "woman"], 13, "Anastasia Shuraeva", "https://www.pexels.com/video/woman-working-out-at-the-gym-4944392/", "https://images.pexels.com/videos/4944392/barbell-beautifully-body-couple-4944392.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/4944392/4944392-uhd_2160_4096_24fps.mp4", { fps: [24, 30], portrait: true }),
  V(4945125, "Person running at the treadmill", ["fitness", "running", "treadmill", "cardio"], 16, "Anastasia Shuraeva", "https://www.pexels.com/video/person-running-at-the-treadmill-4945125/", "https://images.pexels.com/videos/4945125/barbell-beautifully-body-couple-4945125.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/4945125/4945125-uhd_4096_2160_24fps.mp4", { fps: [24, 30] }),
  V(16105940, "View of the ocean from an airplane wing", ["travel", "airplane", "ocean", "flight", "holiday"], 8, "Petra Nesti", "https://www.pexels.com/video/a-view-of-the-ocean-from-an-airplane-wing-16105940/", "https://images.pexels.com/videos/16105940/pexels-photo-16105940.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/16105940/16105940-hd_1080_1920_30fps.mp4", { fps: [30], portrait: true }),
  V(33337664, "Airplane soaring above beach umbrellas", ["travel", "airplane", "beach", "holiday", "summer"], 8, "C1 Superstar", "https://www.pexels.com/video/airplane-soaring-above-beach-umbrellas-33337664/", "https://images.pexels.com/videos/33337664/aerial-aerial-travel-air-travel-airline-travel-33337664.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/33337664/14195573_1080_1920_60fps.mp4", { fps: [60, 30], portrait: true }),
  V(15547414, "Plane flying over the ocean with a view of the city", ["travel", "airplane", "ocean", "city", "flight"], 17, "K", "https://www.pexels.com/video/a-plane-flying-over-the-ocean-with-a-view-of-the-city-15547414/", "https://images.pexels.com/videos/15547414/pexels-photo-15547414.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/15547414/15547414-hd_1920_1080_24fps.mp4", { fps: [24, 30] }),
  V(34426516, "In-flight view of clouds from airplane wing", ["travel", "airplane", "clouds", "flight", "sky"], 18, "Yunus KARA", "https://www.pexels.com/video/in-flight-view-of-clouds-from-airplane-wing-34426516/", "https://images.pexels.com/videos/34426516/4k-airplane-airport-beach-34426516.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/34426516/14584213_1080_1920_60fps.mp4", { fps: [60, 30], portrait: true }),
  V(34426496, "Aerial view of Istanbul from airplane window", ["travel", "istanbul", "city", "aerial", "flight"], 20, "Yunus KARA", "https://www.pexels.com/video/aerial-view-of-istanbul-from-airplane-window-34426496/", "https://images.pexels.com/videos/34426496/4k-airplane-airport-beach-34426496.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630", "https://videos.pexels.com/video-files/34426496/14584079_1080_1920_60fps.mp4", { fps: [60, 30], portrait: true }),
  V(10256127, "Airplane flying over beach on shore", ["travel", "airplane", "beach", "coast", "holiday"], 20, "Matthias Groeneveld", "https://www.pexels.com/video/airplane-flying-over-beach-on-shore-10256127/", "https://images.pexels.com/videos/10256127/pexels-photo-10256127.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/10256127/10256127-hd_3840_2160_24fps.mp4", { fps: [24, 30] }),
  V(34804221, "Vibrant neon text animation with like and subscribe", ["marketing", "social", "neon", "subscribe", "cta", "animation"], 5, "Nicola Narracci", "https://www.pexels.com/video/vibrant-neon-text-animation-with-like-subscribe-34804221/", "https://images.pexels.com/videos/34804221/pexels-photo-34804221.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/34804221/14756796_1920_1080_30fps.mp4", { fps: [30] }),
  V(34804258, "Vibrant 3D like and subscribe animation", ["marketing", "social", "3d", "animation", "subscribe"], 5, "Nicola Narracci", "https://www.pexels.com/video/vibrant-3d-like-and-subscribe-animation-34804258/", "https://images.pexels.com/videos/34804258/pexels-photo-34804258.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/34804258/14756816_1920_1080_30fps.mp4", { fps: [30] }),
  V(34804600, "Dynamic like and subscribe animation effects", ["marketing", "social", "like", "animation", "cta"], 5, "Nicola Narracci", "https://www.pexels.com/video/dynamic-like-and-subscribe-animation-effects-34804600/", "https://images.pexels.com/videos/34804600/pexels-photo-34804600.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/34804600/14756957_1920_1080_30fps.mp4", { fps: [30] }),
  V(29717596, "Dynamic abstract light trail animation", ["marketing", "abstract", "lights", "background", "animation"], 8, "Chandresh Uike", "https://www.pexels.com/video/dynamic-abstract-light-trail-animation-29717596/", "https://images.pexels.com/videos/29717596/3d-4k-abstract-backdrop-29717596.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/29717596/12777867_3840_2160_30fps.mp4", { fps: [30] }),
  V(3874461, "Animation of a neon sign", ["marketing", "neon", "sign", "night", "animation"], 10, "Steve B", "https://www.pexels.com/video/an-animation-of-a-neon-sign-3874461/", "https://images.pexels.com/videos/3874461/cgi-3d-illuminated-sign-neon-neon-sign-3874461.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/3874461/3874461-hd_1920_1080_25fps.mp4", { fps: [25, 30] }),
  V(36017433, "Vibrant neon light trails on dark background", ["marketing", "neon", "background", "lights", "abstract"], 10, "Nicola Narracci", "https://www.pexels.com/video/vibrant-neon-light-trails-on-dark-background-36017433/", "https://images.pexels.com/videos/36017433/pexels-photo-36017433.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", "https://videos.pexels.com/video-files/36017433/15273099_1920_1080_30fps.mp4", { fps: [30] }),
];

const photos = [
  P(4385247, "Aerial photo of a sunset over a city", ["city", "sunset", "aerial", "skyline", "urban"], "Martin Ziomek", "https://www.pexels.com/photo/aerial-photo-of-a-sunset-at-a-city-in-poland-4385247/", "https://images.pexels.com/photos/4385247/pexels-photo-4385247.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-4385247.jpeg"),
  P(14840760, "Aerial shot of Panama City", ["city", "skyline", "aerial", "travel"], "Luis Quintero", "https://www.pexels.com/photo/aerial-shot-of-panama-city-in-panama-14840760/", "https://images.pexels.com/photos/14840760/pexels-photo-14840760.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-14840760.jpeg"),
  P(6366108, "Residential buildings in the city at sunset", ["city", "buildings", "sunset", "architecture"], "Barrett Shutt", "https://www.pexels.com/photo/residential-buildings-in-city-6366108/", "https://images.pexels.com/photos/6366108/pexels-photo-6366108.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-6366108.jpeg"),
  P(14529110, "City against the sky at dusk", ["city", "dusk", "skyline", "architecture"], "Ayşe7", "https://www.pexels.com/photo/city-against-the-sky-at-dusk-14529110/", "https://images.pexels.com/photos/14529110/pexels-photo-14529110.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-14529110.jpeg"),
  P(14075142, "Aerial view of a modern city at sunset", ["city", "sunset", "aerial", "modern"], "周赛 王", "https://www.pexels.com/photo/aerial-view-of-a-modern-city-at-sunset-14075142/", "https://images.pexels.com/photos/14075142/pexels-photo-14075142.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-14075142.jpeg"),
  P(19296981, "Skyscrapers in a city during sunset", ["city", "skyscraper", "sunset", "business"], "Steve Chen", "https://www.pexels.com/photo/skyscrapers-in-a-city-during-sunset-19296981/", "https://images.pexels.com/photos/19296981/pexels-photo-19296981.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-19296981.jpeg"),
  P(35208811, "Alpine river with clear blue water", ["nature", "river", "mountain", "blue", "calm"], "Joost van Os", "https://www.pexels.com/photo/35208811/", "https://images.pexels.com/photos/35208811/35208811.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "35208811.jpeg"),
  P(22666600, "Woods in Zittau mountains nature park on foggy day", ["nature", "forest", "fog", "trees", "moody"], "Nikita Pishchugin", "https://www.pexels.com/photo/woods-in-zittau-mountains-nature-park-on-foggy-day-22666600/", "https://images.pexels.com/photos/22666600/pexels-photo-22666600.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-22666600.jpeg"),
  P(9629615, "Green dress on the mountain under the sky", ["nature", "mountain", "sky", "green"], "Karolina", "https://www.pexels.com/photo/green-dress-on-the-mountain-under-the-sky-9629615/", "https://images.pexels.com/photos/9629615/pexels-photo-9629615.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-9629615.jpeg"),
  P(6072751, "Green pine trees near snow covered mountain", ["nature", "mountain", "snow", "forest", "winter"], "Pavel Danilyuk", "https://www.pexels.com/photo/green-pine-trees-near-snow-covered-mountain-6072751/", "https://images.pexels.com/photos/6072751/pexels-photo-6072751.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-6072751.jpeg"),
  P(38520172, "Scenic forested mountains in Kashmir", ["nature", "mountain", "forest", "scenery"], "Mohd Atir", "https://www.pexels.com/photo/scenic-forested-mountains-in-kashmir-india-38520172/", "https://images.pexels.com/photos/38520172/pexels-photo-38520172.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-38520172.jpeg"),
  P(1128207, "Silver laptop on a tabletop", ["technology", "laptop", "workspace", "desk"], "EVG Kowalievska", "https://www.pexels.com/photo/turned-on-silver-laptop-on-tabletop-1128207/", "https://images.pexels.com/photos/1128207/pexels-photo-1128207.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-1128207.jpeg"),
  P(10567169, "Desk with laptop and office supplies", ["productivity", "desk", "office", "laptop"], "Ron Lach", "https://www.pexels.com/photo/desk-with-laptop-and-office-supplies-10567169/", "https://images.pexels.com/photos/10567169/pexels-photo-10567169.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-10567169.jpeg"),
  P(265148, "Silver macbook beside a wallet", ["technology", "macbook", "minimal", "productivity"], "Pixabay", "https://www.pexels.com/photo/silver-macbook-beside-wallet-265148/", "https://images.pexels.com/photos/265148/pexels-photo-265148.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-265148.jpeg"),
  P(5793947, "Silver laptop on white table", ["technology", "minimal", "workspace"], "Yan Krukau", "https://www.pexels.com/photo/silver-laptop-on-white-table-5793947/", "https://images.pexels.com/photos/5793947/pexels-photo-5793947.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-5793947.jpeg"),
  P(129205, "Macbook pro on a wooden table", ["technology", "workspace", "wood", "macbook"], "Nao Triponez", "https://www.pexels.com/photo/macbook-pro-on-brown-wooden-table-129205/", "https://images.pexels.com/photos/129205/pexels-photo-129205.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-129205.jpeg"),
  P(7379, "Macbook air, pen and paper on a brown desk", ["productivity", "desk", "office"], "Startup Stock Photos", "https://www.pexels.com/photo/turned-off-macbook-air-infront-black-ballpoint-pen-on-brown-paper-7379/", "https://images.pexels.com/photos/7379/startup-photos.jpg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "startup-photos.jpg"),
  P(7061, "Man using macbook while holding a pen", ["productivity", "writing", "desk"], "Startup Stock Photos", "https://www.pexels.com/photo/man-using-macbook-while-holding-pen-7061/", "https://images.pexels.com/photos/7061/man-people-space-desk.jpg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "man-people-space-desk.jpg"),
  P(8250143, "Coffee and cake in a cozy cafe", ["coffee", "cake", "cafe", "food"], "Julia Filirovska", "https://www.pexels.com/photo/coffee-and-cake-8250143/", "https://images.pexels.com/photos/8250143/pexels-photo-8250143.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-8250143.jpeg"),
  P(10139822, "Bread on a white plate", ["food", "bakery", "breakfast"], "Александра Червякова", "https://www.pexels.com/photo/close-up-photo-of-bread-on-white-plate-10139822/", "https://images.pexels.com/photos/10139822/pexels-photo-10139822.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-10139822.jpeg"),
  P(39510314, "Grilled sandwich with cappuccino", ["food", "sandwich", "coffee", "cafe"], "Hamza Al Masri", "https://www.pexels.com/photo/delicious-grilled-sandwich-with-cappuccino-39510314/", "https://images.pexels.com/photos/39510314/pexels-photo-39510314.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-39510314.jpeg"),
  P(2478351, "Strawberry cake dessert with coffee", ["food", "dessert", "coffee", "sweet"], "Engin Akyurt", "https://www.pexels.com/photo/strawberry-cake-dessert-2478351/", "https://images.pexels.com/photos/2478351/pexels-photo-2478351.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-2478351.jpeg"),
  P(15934872, "Top-down cappuccino with foam art", ["coffee", "latte", "cafe", "food"], "Charise Pieterse", "https://www.pexels.com/photo/close-up-of-coffee-in-cup-15934872/", "https://images.pexels.com/photos/15934872/pexels-photo-15934872.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-15934872.jpeg"),
  P(6985049, "Green and blue gradient", ["abstract", "gradient", "background", "green", "blue"], "Codioful", "https://www.pexels.com/photo/green-and-blue-gradient-6985049/", "https://images.pexels.com/photos/6985049/pexels-photo-6985049.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-6985049.jpeg"),
  P(7135053, "Pastel colour gradient", ["abstract", "gradient", "background", "pastel"], "Codioful", "https://www.pexels.com/photo/a-pastel-color-gradient-7135053/", "https://images.pexels.com/photos/7135053/pexels-photo-7135053.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-7135053.jpeg"),
  P(7135074, "Multicoloured background", ["abstract", "gradient", "background", "colorful"], "Codioful", "https://www.pexels.com/photo/multicolored-background-7135074/", "https://images.pexels.com/photos/7135074/pexels-photo-7135074.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-phote-7135074.jpeg"),
  P(40102964, "Abstract fluid art swirls", ["abstract", "fluid", "background", "colorful"], "Marie Gaebel", "https://www.pexels.com/photo/vibrant-abstract-fluid-art-with-colorful-swirls-40102964/", "https://images.pexels.com/photos/40102964/pexels-photo-40102964.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-40102964.jpeg"),
  P(11605082, "Colourful crumpled paper", ["abstract", "texture", "background", "colorful"], "Tim Mossholder", "https://www.pexels.com/photo/colorful-crumpled-paper-11605082/", "https://images.pexels.com/photos/11605082/pexels-photo-11605082.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-11605082.jpeg"),
  P(7130491, "Bright colourful lights on abstract background", ["abstract", "lights", "background", "purple"], "Codioful", "https://www.pexels.com/photo/bright-colorful-lights-on-abstract-background-7130491/", "https://images.pexels.com/photos/7130491/pexels-photo-7130491.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-7130491.jpeg"),
  P(5257576, "Colleagues planning a business", ["team", "business", "meeting", "office", "collaboration"], "Thirdman", "https://www.pexels.com/photo/colleagues-planning-a-business-5257576/", "https://images.pexels.com/photos/5257576/pexels-photo-5257576.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-5257576.jpeg"),
  P(7413914, "Man and woman near a whiteboard", ["team", "startup", "whiteboard", "planning"], "RDNE Stock project", "https://www.pexels.com/photo/man-and-woman-standing-near-the-white-board-7413914/", "https://images.pexels.com/photos/7413914/pexels-photo-7413914.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-7413914.jpeg"),
  P(6803532, "Men presenting at the office", ["team", "presentation", "business", "office"], "cottonbro studio", "https://www.pexels.com/photo/men-presenting-at-office-6803532/", "https://images.pexels.com/photos/6803532/pexels-photo-6803532.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-6803532.jpeg"),
  P(7180972, "Person drawing on a whiteboard", ["team", "whiteboard", "idea", "collaboration"], "Thirdman", "https://www.pexels.com/photo/a-person-discussing-with-a-man-a-drawing-on-a-white-board-7180972/", "https://images.pexels.com/photos/7180972/pexels-photo-7180972.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-7180972.jpeg"),
  P(39205092, "Team brainstorming in modern office", ["team", "brainstorm", "office", "startup"], "Vitaly Gariev", "https://www.pexels.com/photo/team-brainstorming-session-in-modern-office-39205092/", "https://images.pexels.com/photos/39205092/pexels-photo-39205092.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-39205092.jpeg"),
  P(7693692, "Business people brainstorming in a meeting", ["business", "meeting", "charts", "office"], "Yan Krukau", "https://www.pexels.com/photo/businesspeople-brainstorming-in-a-meeting-7693692/", "https://images.pexels.com/photos/7693692/pexels-photo-7693692.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-7693692.jpeg"),
  P(12903168, "Employees cooperating in office", ["team", "office", "collaboration", "business"], "Mizuno K", "https://www.pexels.com/photo/employees-cooperating-in-office-12903168/", "https://images.pexels.com/photos/12903168/pexels-photo-12903168.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", "pexels-photo-12903168.jpeg"),
];

const VIDEO_RES = [
  { w: 1920, h: 1080, q: "hd" },
  { w: 1280, h: 720, q: "hd" },
  { w: 960, h: 540, q: "sd" },
  { w: 640, h: 360, q: "sd" },
  { w: 426, h: 240, q: "sd" },
];

async function head(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok) return null;
    return {
      bytes: Number(res.headers.get("content-length") ?? 0),
      type: res.headers.get("content-type") ?? "",
    };
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const catalog = [];

console.log(`Probing ${videos.length} videos and ${photos.length} photos...`);

await mapLimit(videos, 8, async (v) => {
  const numericId = v.id.slice(1);
  const candidates = [];
  const seen = new Set();
  const push = (url, w, h, fps) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, width: w, height: h, fps });
  };

  const knownMatch = v.knownUrl.match(/(\d+)_(\d+)_(\d+)_(\d+)fps\.mp4$/);
  if (knownMatch) {
    const [, w, h, fps] = knownMatch;
    push(v.knownUrl, Number(w), Number(h), Number(fps));
  } else {
    const m = v.knownUrl.match(/-(hd|sd|uhd)_(\d+)_(\d+)_(\d+)fps\.mp4$/);
    if (m) push(v.knownUrl, Number(m[2]), Number(m[3]), Number(m[4]));
  }

  for (const fps of v.fps) {
    for (const r of VIDEO_RES) {
      push(
        `https://videos.pexels.com/video-files/${numericId}/${numericId}-${r.q}_${r.w}_${r.h}_${fps}fps.mp4`,
        r.w,
        r.h,
        fps,
      );
    }
  }

  const sources = [];
  for (const c of candidates) {
    const res = await head(c.url);
    if (!res) continue;
    sources.push({ ...c, bytes: res.bytes });
  }
  sources.sort((a, b) => a.height - b.height || a.bytes - b.bytes);

  if (sources.length === 0) {
    console.log(`  ! no sources for ${v.id}`);
    return;
  }
  catalog.push({
    id: v.id,
    provider: "pexels",
    type: "video",
    title: v.title,
    tags: v.tags,
    creator: v.creator,
    pageUrl: v.pageUrl,
    thumb: v.thumb,
    duration: v.duration,
    portrait: v.portrait,
    sources: sources.map((s) => ({ url: s.url, width: s.width, height: s.height, fps: s.fps, bytes: s.bytes })),
  });
  console.log(`  ok ${v.id} (${sources.length} renditions)`);
});

await mapLimit(photos, 8, async (p) => {
  const numericId = p.id.slice(1);
  const files = [p.file, `pexels-photo-${numericId}.jpeg`, `${numericId}.jpeg`];
  const sources = [];
  for (const file of files) {
    if (sources.length >= 2) break;
    for (const w of [1920, 1280]) {
      const url = `https://images.pexels.com/photos/${numericId}/${file}?auto=compress&cs=tinysrgb&w=${w}`;
      const res = await head(url);
      if (res) sources.push({ url, width: w, bytes: res.bytes });
    }
  }
  if (sources.length === 0) {
    console.log(`  ! no sources for ${p.id}`);
    return;
  }
  catalog.push({
    id: p.id,
    provider: "pexels",
    type: "photo",
    title: p.title,
    tags: p.tags,
    creator: p.creator,
    pageUrl: p.pageUrl,
    thumb: p.thumb,
    sources: sources.map((s) => ({ url: s.url, width: s.width, bytes: s.bytes })),
  });
  console.log(`  ok ${p.id} (${sources.length} renditions)`);
});

catalog.sort((a, b) => (a.type === b.type ? a.title.localeCompare(b.title) : a.type === "video" ? -1 : 1));

const out = resolve(process.cwd(), "src/lib/stock-catalog.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(catalog, null, 2));
console.log(`\nWrote ${catalog.length} assets -> ${out}`);

/**
 * 20 pre-built avatar options for TeamOS users powered by the DiceBear API.
 * Uses highly-detailed, beautifully designed cartoon character styles.
 */

export interface AvatarOption {
  id: string;
  label: string;
  svg: string; // DiceBear API SVG URL (retaining field name 'svg' for backward compatibility)
  bgColor: string; // fallback background accent
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  // 1-4: Lorelei (Cute portraits)
  {
    id: "av01",
    label: "Aria (Lorelei)",
    svg: "https://api.dicebear.com/7.x/lorelei/svg?seed=Aria&backgroundColor=ffb8b8,ffccd5,ff85a1",
    bgColor: "#ffccd5"
  },
  {
    id: "av02",
    label: "Kai (Lorelei)",
    svg: "https://api.dicebear.com/7.x/lorelei/svg?seed=Kai&backgroundColor=b3e5fc,e1f5fe,81d4fa",
    bgColor: "#b3e5fc"
  },
  {
    id: "av03",
    label: "Maya (Lorelei)",
    svg: "https://api.dicebear.com/7.x/lorelei/svg?seed=Maya&backgroundColor=d1c4e9,f3e5f5,b39ddb",
    bgColor: "#d1c4e9"
  },
  {
    id: "av04",
    label: "Leo (Lorelei)",
    svg: "https://api.dicebear.com/7.x/lorelei/svg?seed=Leo&backgroundColor=c8e6c9,e8f5e9,a5d6a7",
    bgColor: "#c8e6c9"
  },

  // 5-8: Adventurer (Cute adventure cartoon characters)
  {
    id: "av05",
    label: "Elena (Adventurer)",
    svg: "https://api.dicebear.com/7.x/adventurer/svg?seed=Elena&backgroundColor=ffe082,fff8e1,ffca28",
    bgColor: "#ffe082"
  },
  {
    id: "av06",
    label: "Zane (Adventurer)",
    svg: "https://api.dicebear.com/7.x/adventurer/svg?seed=Zane&backgroundColor=ffcc80,fff3e0,ffb74d",
    bgColor: "#ffcc80"
  },
  {
    id: "av07",
    label: "Chloe (Adventurer)",
    svg: "https://api.dicebear.com/7.x/adventurer/svg?seed=Chloe&backgroundColor=f48fb1,fce4ec,f06292",
    bgColor: "#f48fb1"
  },
  {
    id: "av08",
    label: "Finn (Adventurer)",
    svg: "https://api.dicebear.com/7.x/adventurer/svg?seed=Finn&backgroundColor=80deea,e0f7fa,4dd0e1",
    bgColor: "#80deea"
  },

  // 9-12: Open Peeps (Sketch character art)
  {
    id: "av09",
    label: "Sophie (Peeps)",
    svg: "https://api.dicebear.com/7.x/open-peeps/svg?seed=Sophie&backgroundColor=b2dfdb,e0f2f1,80cbc4",
    bgColor: "#b2dfdb"
  },
  {
    id: "av10",
    label: "Owen (Peeps)",
    svg: "https://api.dicebear.com/7.x/open-peeps/svg?seed=Owen&backgroundColor=cfd8dc,eceff1,b0bec5",
    bgColor: "#cfd8dc"
  },
  {
    id: "av11",
    label: "Lily (Peeps)",
    svg: "https://api.dicebear.com/7.x/open-peeps/svg?seed=Lily&backgroundColor=ffab91,fbe9e7,ff8a65",
    bgColor: "#ffab91"
  },
  {
    id: "av12",
    label: "Noah (Peeps)",
    svg: "https://api.dicebear.com/7.x/open-peeps/svg?seed=Noah&backgroundColor=d7ccc8,efebe9,c2b280",
    bgColor: "#d7ccc8"
  },

  // 13-16: Bottts (Futuristic robotic illustrations)
  {
    id: "av13",
    label: "Robo-A1",
    svg: "https://api.dicebear.com/7.x/bottts/svg?seed=Robo-A1&backgroundColor=cfd8dc,e0f2f1",
    bgColor: "#cfd8dc"
  },
  {
    id: "av14",
    label: "Robo-B2",
    svg: "https://api.dicebear.com/7.x/bottts/svg?seed=Robo-B2&backgroundColor=d1c4e9,ede7f6",
    bgColor: "#d1c4e9"
  },
  {
    id: "av15",
    label: "Robo-C3",
    svg: "https://api.dicebear.com/7.x/bottts/svg?seed=Robo-C3&backgroundColor=ffecb3,fff8e1",
    bgColor: "#ffecb3"
  },
  {
    id: "av16",
    label: "Robo-D4",
    svg: "https://api.dicebear.com/7.x/bottts/svg?seed=Robo-D4&backgroundColor=f8bbd0,fdf2f8",
    bgColor: "#f8bbd0"
  },

  // 17-20: Avataaars (Fun avatar shapes)
  {
    id: "av17",
    label: "Emma (Avataaars)",
    svg: "https://api.dicebear.com/7.x/avataaars/svg?seed=Emma&backgroundColor=ffcdd2,ffebee",
    bgColor: "#ffcdd2"
  },
  {
    id: "av18",
    label: "Jack (Avataaars)",
    svg: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jack&backgroundColor=c8e6c9,e8f5e9",
    bgColor: "#c8e6c9"
  },
  {
    id: "av19",
    label: "Zoe (Avataaars)",
    svg: "https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe&backgroundColor=d1c4e9,f3e5f5",
    bgColor: "#d1c4e9"
  },
  {
    id: "av20",
    label: "Ryan (Avataaars)",
    svg: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ryan&backgroundColor=b3e5fc,e1f5fe",
    bgColor: "#b3e5fc"
  }
];

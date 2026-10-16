import { createCn } from "cn/config"

/**
 * Theme-aware class merger. Always import `cn` from here, never from "cn":
 * the stock engine does not know the DESIGN.md scales, so it reads
 * `text-body` as a colour and drops it whenever `text-foreground` follows
 * in the same call (same for the shadows and `rounded-card`).
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title-lg",
            "title-md",
            "title-sm",
            "body-lg",
            "body",
            "body-strong",
            "caption-lg",
            "caption",
            "caption-strong",
            "micro",
          ],
        },
      ],
      shadow: [{ shadow: ["compact", "float", "search", "focus"] }],
      rounded: [{ rounded: ["card"] }],
    },
  },
})

const INLINE_CARD_STYLE = "display: flex; /* 横並びレイアウトの基本 */              text-decoration: none; color: inherit; font-family: 'Inter', sans-serif; background-color: #ffffff; border-radius: 0.75rem; /* 12px */              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1); overflow: hidden; margin-bottom: 1.5rem; /* カード間のマージン 24px */              width: 100%; /* 親要素の幅に合わせる */              max-width: 640px; /* カードの最大幅 40rem */              margin-left: auto; /* 中央寄せ */              margin-right: auto;";

export interface CardLinkInput {
  productUrl: string;
  imageUrl: string;
  titleText: string;
  descriptionText: string;
}

type EscapedInput = CardLinkInput;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const createCardLinkHtml = (input: CardLinkInput) => {
  const trimmed: EscapedInput = {
    productUrl: input.productUrl.trim(),
    imageUrl: input.imageUrl.trim(),
    titleText: input.titleText.trim(),
    descriptionText: input.descriptionText.trim(),
  };

  if (
    !trimmed.productUrl ||
    !trimmed.imageUrl ||
    !trimmed.titleText ||
    !trimmed.descriptionText
  ) {
    return "";
  }

  const commentTitle = escapeHtml(trimmed.titleText);
  const productHref = escapeHtml(trimmed.productUrl);
  const imageSrc = escapeHtml(trimmed.imageUrl);
  const title = escapeHtml(trimmed.titleText);
  const description = escapeHtml(trimmed.descriptionText);
  const imageAlt = escapeHtml(`${trimmed.titleText}の商品画像`);

  return `<!-- カード: ${commentTitle} --><a href="${productHref}" rel="noopener noreferrer" style="${INLINE_CARD_STYLE}" target="_blank"><!-- 画像コンテナ -->\n<div style="width: 12rem; /* 192px */                    height: 12rem; /* 192px - 正方形を維持 */                    flex-shrink: 0;"><img src="${imageSrc}" alt="${imageAlt}" style="width: 100%; height: 100%; object-fit: cover; display: block;"></div>\n<!-- テキストコンテナ -->\n<div style="padding: 1.25rem; /* 20px */                    display: flex; flex-direction: column; justify-content: center; /* テキストブロック全体を垂直中央に */                    flex-grow: 1; /* 残りのスペースを埋める */                    min-width: 0;">\n<div>\n<!-- テキストコンテンツのラッパー -->\n<div style="font-size: 16px; font-weight: 500; color: #000000; line-height: 1.375; margin-bottom: 0.375rem; /* 6px */                            word-break: break-word; overflow-wrap: break-word;">${title}</div>\n<p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-top: 0; word-break: break-word; overflow-wrap: break-word;">${description}</p>\n</div>\n</div>\n</a>`;
};

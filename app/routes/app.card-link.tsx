import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { createCardLinkHtml } from "../utils/cardLinkHtml";

import styles from "../styles/cardLink.module.css";

const PRODUCT_SEARCH_QUERY = `#graphql
  query CardLinkProducts($query: String!) {
    products(first: 10, query: $query) {
      nodes {
        id
        title
        description
        descriptionHtml
        onlineStoreUrl
        featuredImage {
          url
          altText
        }
      }
    }
  }
`;

interface ProductSummary {
  id: string;
  title: string;
  description: string | null;
  descriptionHtml: string | null;
  onlineStoreUrl: string | null;
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
}

interface SearchActionResponse {
  products: ProductSummary[];
  error?: string;
}

interface ProductsQueryPayload {
  data?: {
    products?: {
      nodes?: ProductSummary[];
    };
  };
  errors?: Array<{ message?: string }>;
}

const MAX_DESCRIPTION_LENGTH = 180;

const escapeSearchToken = (value: string) =>
  value.replace(/[^\p{L}\p{N}-]/gu, "").trim();

const buildProductSearchQuery = (raw: string) => {
  const tokens = raw
    .split(/\s+/)
    .map((token) => escapeSearchToken(token))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return "";
  }

  const clauses = tokens.map(
    (token) =>
      `title:*${token}* OR product_type:*${token}* OR tag:${token} OR handle:*${token}*`,
  );

  return clauses.length === 1
    ? clauses[0]
    : clauses.map((clause) => `(${clause})`).join(" AND ");
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ");

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, limit: number) => {
  if (value.length <= limit) {
    return value;
  }

  if (limit <= 3) {
    return value.slice(0, limit);
  }

  return `${value.slice(0, limit - 3)}...`;
};

const deriveDescription = (product: ProductSummary) => {
  const fallback =
    product.description && product.description.trim().length > 0
      ? product.description
      : product.descriptionHtml
        ? stripHtml(product.descriptionHtml)
        : "";

  const normalized = normalizeWhitespace(fallback);

  return normalized.length > 0
    ? truncate(normalized, MAX_DESCRIPTION_LENGTH)
    : "";
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const searchTerm = formData.get("searchTerm");

  if (typeof searchTerm !== "string") {
    return Response.json({ products: [], error: "検索語が不正です" }, { status: 400 });
  }

  const query = searchTerm.trim();

  if (!query) {
    return Response.json({ products: [] }, { status: 200 });
  }

  const searchQuery = buildProductSearchQuery(query);

  if (!searchQuery) {
    return Response.json({ products: [] }, { status: 200 });
  }

  const response = await admin.graphql(PRODUCT_SEARCH_QUERY, {
    variables: { query: searchQuery },
  });

  const payload = (await response.json()) as ProductsQueryPayload;

  if (payload.errors?.length) {
    const message = payload.errors[0]?.message ?? "商品検索に失敗しました";

    return Response.json({ products: [], error: message }, { status: 502 });
  }

  const nodes: ProductSummary[] = (payload.data?.products?.nodes ?? []).map(
    (node: ProductSummary) => ({
      id: node.id,
      title: node.title,
      description: node.description,
      descriptionHtml: node.descriptionHtml,
      onlineStoreUrl: node.onlineStoreUrl,
      featuredImage: node.featuredImage
        ? { url: node.featuredImage.url, altText: node.featuredImage.altText }
        : null,
    }),
  );

  if (nodes.length === 0) {
    return Response.json({ products: [] }, { status: 200 });
  }

  return Response.json({ products: nodes }, { status: 200 });
};

export default function CardLinkPage() {
  const shopify = useAppBridge();
  const searchFetcher = useFetcher<SearchActionResponse>();
  const [searchTerm, setSearchTerm] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [titleText, setTitleText] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [clipboardReady, setClipboardReady] = useState(false);

  useEffect(() => {
    setClipboardReady(Boolean(navigator.clipboard?.writeText));
  }, []);

  useEffect(() => {
    if (searchFetcher.data?.error) {
      shopify?.toast.show(searchFetcher.data.error);
    }
  }, [searchFetcher.data?.error, shopify]);

  const applyProduct = useCallback(
    (product: ProductSummary) => {
      const derivedDescription = deriveDescription(product);

      setProductUrl(product.onlineStoreUrl ?? "");
      setImageUrl(product.featuredImage?.url ?? "");
      setTitleText(product.title ?? "");
      setDescriptionText(derivedDescription);

      const missing: string[] = [];

      if (!product.onlineStoreUrl) {
        missing.push("オンラインストアURL");
      }

      if (!product.featuredImage?.url) {
        missing.push("商品画像URL");
      }

      if (!derivedDescription) {
        missing.push("商品説明");
      }

      setMissingFields(missing);
      shopify?.toast.show("商品情報を読み込みました");
    },
    [shopify],
  );

  const generatedHtml = useMemo(
    () =>
      createCardLinkHtml({
        productUrl,
        imageUrl,
        titleText,
        descriptionText,
      }),
    [productUrl, imageUrl, titleText, descriptionText],
  );

  const handleCopy = useCallback(async () => {
    if (!generatedHtml) {
      return;
    }

    if (!clipboardReady || !navigator.clipboard) {
      shopify?.toast.show("クリップボードにアクセスできません");
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedHtml);
      shopify?.toast.show("カードリンクHTMLをコピーしました");
    } catch (error) {
      shopify?.toast.show("コピーに失敗しました");
    }
  }, [clipboardReady, generatedHtml, shopify]);

  const products = searchFetcher.data?.products ?? [];
  const isSearching = searchFetcher.state === "submitting";
  const isCopyDisabled = !generatedHtml || !clipboardReady;

  return (
    <s-page heading="カードリンク生成">
      <div className={styles.grid}>
        <div className={styles.column}>
          <s-section heading="商品検索">
            <div className={styles.cardBody}>
              <searchFetcher.Form method="post">
                <div className={styles.formRow}>
                  <s-text-field
                    name="searchTerm"
                    label="商品名で検索"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.currentTarget.value)}
                    placeholder="例: 華粉"
                  ></s-text-field>
                  <s-button
                    type="submit"
                    variant="primary"
                    {...(isSearching ? { loading: true } : {})}
                    disabled={!searchTerm.trim()}
                  >
                    検索
                  </s-button>
                </div>
              </searchFetcher.Form>
              {products.length > 0 && (
                <div className={styles.results}>
                  {products.map((product) => (
                    <div className={styles.resultItem} key={product.id}>
                      <div className={styles.resultInfo}>
                        <span className={styles.resultTitle}>{product.title}</span>
                        <span className={styles.resultMeta}>
                          {product.onlineStoreUrl ?? "オンラインストアURLが未設定です"}
                        </span>
                      </div>
                      <s-button
                        type="button"
                        variant="tertiary"
                        onClick={() => applyProduct(product)}
                      >
                        取り込む
                      </s-button>
                    </div>
                  ))}
                </div>
              )}
              {!isSearching && products.length === 0 && searchTerm.trim() && (
                <s-text>検索結果が見つかりませんでした。</s-text>
              )}
            </div>
          </s-section>

          <s-section heading="入力フィールド">
            <div className={styles.cardBody}>
              {missingFields.length > 0 && (
                <div className={styles.notice}>
                  {missingFields.join("、")} を手動で入力してください。
                </div>
              )}
              <s-text-field
                name="product_url"
                label="product_url"
                value={productUrl}
                onChange={(event) => setProductUrl(event.currentTarget.value)}
                placeholder="https://"
              ></s-text-field>
              <s-text-field
                name="image_url"
                label="image_url"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.currentTarget.value)}
                placeholder="https://"
              ></s-text-field>
              <s-text-field
                name="title_text"
                label="title_text"
                value={titleText}
                onChange={(event) => setTitleText(event.currentTarget.value)}
                placeholder="例: 小麦粉「華粉（はなこ）」北海道産きたほなみ100%"
              ></s-text-field>
              <label className={styles.textareaField}>
                <span>description_text</span>
                <textarea
                  name="description_text"
                  value={descriptionText}
                  onChange={(event) => setDescriptionText(event.currentTarget.value)}
                  placeholder="説明文を入力してください"
                  rows={5}
                />
              </label>
            </div>
          </s-section>
        </div>

        <div className={styles.column}>
          <div className={styles.previewCard}>
            <s-heading>プレビュー</s-heading>
            <div className={styles.previewSurface}>
              {generatedHtml ? (
                <div
                  className={styles.previewInner}
                  dangerouslySetInnerHTML={{ __html: generatedHtml }}
                />
              ) : (
                <s-text>必要なフィールドが揃うとカードプレビューが表示されます。</s-text>
              )}
            </div>
          </div>

          <div className={styles.previewCard}>
            <s-heading>生成HTML</s-heading>
            <div className={styles.codeCard}>
              <pre className={styles.codeBlock}>
                <code>{generatedHtml || "<!-- 入力を完了するとHTMLが表示されます -->"}</code>
              </pre>
              <div className={styles.copyRow}>
                <s-button
                  type="button"
                  variant="primary"
                  onClick={handleCopy}
                  disabled={isCopyDisabled}
                >
                  HTMLをコピー
                </s-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

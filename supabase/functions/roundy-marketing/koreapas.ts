import Encoding from 'npm:encoding-japanese@2.2.0';
const GOPAS_FREE_AD_URL='https://www.koreapas.com/bbs/zboard.php?id=freead';
const GOPAS_LOGIN_URL='https://www.koreapas.com/m/fast_menu_index.php';
const GOPAS_LOGIN_SUBMIT_URL='https://www.koreapas.com/bbs/login_check.php';
const GOPAS_WRITE_URL='https://www.koreapas.com/bbs/write.php?id=freead&category=';
const GOPAS_BROWSER_USER_AGENT='Mozilla/5.0 RoundyMarketing/1.0';
export async function hasAdvertOnGopasFirstPage(title:string){
 const response=await fetch(GOPAS_FREE_AD_URL,{headers:{'User-Agent':GOPAS_BROWSER_USER_AGENT},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Could not check Koreapas for duplicate posts');
 const html=Encoding.convert(new Uint8Array(await response.arrayBuffer()),{from:'EUC-KR',to:'UNICODE',type:'string'}) as string;
 return html.includes(title.trim());
}
type KoreapasRequestInit = Omit<RequestInit, "headers" | "redirect"> & { headers?: HeadersInit };

const encodeEucKrForm = (fields: Record<string, string>) => {
  const encodeBytes = (bytes: number[]) =>
    bytes
      .map((byte) => {
        const safe =
          (byte >= 0x30 && byte <= 0x39) ||
          (byte >= 0x41 && byte <= 0x5a) ||
          (byte >= 0x61 && byte <= 0x7a) ||
          byte === 0x2d || byte === 0x2e || byte === 0x5f || byte === 0x7e;
        return safe ? String.fromCharCode(byte) : `%${byte.toString(16).padStart(2, "0").toUpperCase()}`;
      })
      .join("");
  return Object.entries(fields)
    .map(([key, value]) => {
      const valueBytes = Encoding.convert(value, { to: "EUC-KR", type: "array" }) as number[];
      return `${encodeBytes([...new TextEncoder().encode(key)])}=${encodeBytes(valueBytes)}`;
    })
    .join("&");
};

const formAttribute = (tag: string, attribute: string) => {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
};

const saveCookies = (jar: Map<string, string>, headers: Headers) => {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie
    ? getSetCookie.call(headers)
    : headers
        .get("set-cookie")
        ?.split(/,(?=[^;,]+=)/)
        .map((cookie) => cookie.trim()) ?? [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";", 1);
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
};

const fetchKoreapas = async (
  jar: Map<string, string>,
  input: string,
  init: KoreapasRequestInit = {},
): Promise<Response> => {
  let url = input;
  let request = init;
  for (let redirects = 0; redirects < 6; redirects += 1) {
    if(new URL(url).origin!=="https://www.koreapas.com") throw new Error("Unexpected Koreapas redirect");
    const headers = new Headers(request.headers);
    headers.set("User-Agent", GOPAS_BROWSER_USER_AGENT);
    headers.set("Cookie", [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "));
    const response = await fetch(url, {
      ...request,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    saveCookies(jar, response.headers);
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) return response;
    url = new URL(location, url).toString();
    request = { method: "GET", headers: { Referer: input } };
  }
  throw new Error("Koreapas redirected too many times.");
};

const writeForm = (html: string) => {
  const matched = html.match(/<form\b[^>]*\b(?:id|name)=["']?write2["']?[^>]*>([\s\S]*?)<\/form>/i);
  if (!matched) throw new Error("Koreapas write form was not available after login.");
  const form = matched[0];
  const action = formAttribute(form.slice(0, form.indexOf(">") + 1), "action");
  if (!action) throw new Error("Koreapas write form action was not available.");
  const hidden = [...matched[1].matchAll(/<input\b[^>]*>/gi)].reduce<Record<string, string>>((fields, match) => {
    const input = match[0];
    if (formAttribute(input, "type").toLowerCase() !== "hidden") return fields;
    const name = formAttribute(input, "name");
    if (name) fields[name] = formAttribute(input, "value");
    return fields;
  }, {});
  return { action, hidden };
};

export const publishToKoreapas = async (title: string, content: string): Promise<string> => {
  const userId = Deno.env.get("KOREAPAS_USER_ID")?.trim();
  const password = Deno.env.get("KOREAPAS_PASSWORD")?.trim();
  if (!userId || !password) throw new Error("Koreapas credentials are not configured.");

  const jar = new Map<string, string>();
  const loginPage = await fetchKoreapas(jar, GOPAS_LOGIN_URL);
  if (!loginPage.ok) throw new Error(`Koreapas login page returned ${loginPage.status}.`);
  const login = await fetchKoreapas(jar, GOPAS_LOGIN_SUBMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: GOPAS_LOGIN_URL, Origin: "https://www.koreapas.com" },
    body: encodeEucKrForm({ s_url: "/m/fast_menu_index.php", auto_login: "1", user_id: userId, password, group_no: "1" }),
  });
  if (!login.ok) throw new Error(`Koreapas login returned ${login.status}.`);

  const writePage = await fetchKoreapas(jar, GOPAS_WRITE_URL, { headers: { Referer: GOPAS_LOGIN_URL } });
  if (!writePage.ok) throw new Error(`Koreapas write page returned ${writePage.status}.`);
  const writeHtml = await writePage.text();
  if (/name=["']?zb_login/i.test(writeHtml)) {
    throw new Error("Koreapas login did not create an authenticated write session.");
  }
  const { action, hidden } = writeForm(writeHtml);
  const submit = await fetchKoreapas(jar, new URL(action, GOPAS_WRITE_URL).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: GOPAS_WRITE_URL, Origin: "https://www.koreapas.com" },
    body: encodeEucKrForm({ ...hidden, subject: title, sitelink1: "", use_html: "1", memo: content, agreement: "1" }),
  });
  if (!submit.ok) throw new Error(`Koreapas post submission returned ${submit.status}.`);
  const resultBytes = new Uint8Array(await submit.arrayBuffer());
  const result = Encoding.convert(resultBytes, { from: "EUC-KR", to: "UNICODE", type: "string" }) as string;
  if (/write2|name=["']?subject/i.test(result)) throw new Error("Koreapas did not accept the advert submission.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await hasAdvertOnGopasFirstPage(title)) return GOPAS_FREE_AD_URL;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Koreapas did not show the submitted advert on the first free-ad page.");
};


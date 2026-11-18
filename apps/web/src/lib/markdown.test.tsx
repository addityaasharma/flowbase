import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "./markdown";

const html = (md: string) => renderToStaticMarkup(<>{renderMarkdown(md, { toneOf: () => ({ soft: "bg-x", text: "text-x" }) })}</>);

describe("markdown renderer: nothing a user types can run code", () => {
  it("shows <script> and event handlers as plain text", () => {
    const out = html('<script>alert(1)</script>\n<img src=x onerror="alert(2)">');
    expect(out).not.toContain("<script");
    expect(out).not.toMatch(/<img[^>]*onerror/i);
    expect(out).toContain("&lt;script&gt;");
  });
  it("does not create links for javascript:, data: or vbscript: URLs", () => {
    const out = html("[a](javascript:alert(1)) [b](data:text/html;base64,AAAA) [c](vbscript:x) <a href=\"javascript:1\">d</a>");
    expect(out).not.toMatch(/href="(javascript|data|vbscript):/i);
  });
  it("only allows https images and our own uploads", () => {
    expect(html("![x](javascript:alert(1))")).not.toContain("<img");
    expect(html("![x](http://insecure.example/a.png)")).not.toContain("<img");
    expect(html("![x](data:image/svg+xml;base64,AAAA)")).not.toContain("<img");
    expect(html("![x](https://example.com/a.png)")).toContain('src="https://example.com/a.png"');
    expect(html("![x](/api/uploads/0123456789abcdef0123456789abcdef.png)")).toContain("/uploads/0123456789abcdef0123456789abcdef.png");
    expect(html("![x](/api/uploads/../../etc/passwd)")).not.toContain("<img");
  });
  it("opens good links safely", () => {
    const out = html("[docs](https://example.com/x)");
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });
});

describe("markdown renderer: formatting", () => {
  it("renders bullets, numbers, nested lists and checklists", () => {
    expect(html("- a\n- b")).toMatch(/<ul[^>]*><li[^>]*>.*a.*<\/li><li[^>]*>.*b/s);
    expect(html("1. one\n2. two")).toContain("<ol");
    expect(html("- a\n  - nested")).toMatch(/<ul[^>]*>.*<ul/s);
    const task = html("- [x] done\n- [ ] todo");
    expect(task).toContain('type="checkbox"');
    expect(task).toContain("line-through");
  });
  it("renders bold, italic, inline code and code blocks without interpreting their contents", () => {
    const out = html("**b** *i* `c`\n\n```\n<b>not bold</b>\n```");
    expect(out).toContain("<strong");
    expect(out).toContain("<em>i</em>");
    expect(out).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });
  it("turns @[Name](u:id) into a highlighted mention", () => {
    const out = html("hi @[Ada Lovelace](u:abc12345def)");
    expect(out).toContain("@Ada Lovelace");
    expect(out).toContain("bg-x");
    expect(html("[Ada](u:abc12345)")).not.toContain("@");
  });
});

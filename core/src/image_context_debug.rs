#[cfg(test)]
mod debug {
    use super::*;

    #[test]
    fn debug_context() {
        let content = "前面的文字内容。![[image.png]]后面的文字内容。";
        let image_pos = content.find("![[").unwrap();

        let context = extract_context(content, image_pos, 10);

        eprintln!("\n=== DEBUG ===");
        eprintln!("Image pos (bytes): {}", image_pos);
        eprintln!("Context (10 chars before/after): {:?}", context);
        eprintln!("Context length: {}", context.len());
        eprintln!("Contains '前面的文字': {}", context.contains("前面的文字"));
        eprintln!("Contains '后面的文字': {}", context.contains("后面的文字"));
        eprintln!("Contains '![[': {}", context.contains("![["));
    }

    #[test]
    fn debug_section() {
        let markdown = r#"# 旅行日记

## 巴黎之旅

2024年春天，我去了巴黎。
埃菲尔铁塔非常壮观。

![[paris/eiffel.jpg]]

这是铁塔的照片。

## 伦敦之旅

伦敦的大本钟也很漂亮。
"#;

        let image_pos = markdown.find("![[").unwrap();
        let context = extract_section_context(markdown, image_pos);

        eprintln!("\n=== SECTION DEBUG ===");
        eprintln!("Image pos: {}", image_pos);
        eprintln!("Section context:\n{}", context);
        eprintln!("\nContains '巴黎之旅': {}", context.contains("巴黎之旅"));
        eprintln!("Contains '埃菲尔铁塔': {}", context.contains("埃菲尔铁塔"));
        eprintln!("Contains '伦敦': {}", context.contains("伦敦"));
    }
}

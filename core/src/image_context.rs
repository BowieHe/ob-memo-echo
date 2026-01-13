use regex::Regex;
use serde::{Deserialize, Serialize};

/// 图片链接语法类型
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ImageSyntaxType {
    /// Obsidian 语法: ![[image.png]]
    Obsidian,
    /// Markdown 标准语法: ![alt](path/to/image.png)
    Markdown,
}

/// 图片链接结构
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImageLink {
    /// 图片路径
    pub path: String,
    /// 在文本中的位置
    pub position: usize,
    /// 提取的上下文
    pub context: String,
    /// 语法类型
    pub syntax_type: ImageSyntaxType,
}

/// 从 Markdown 文本中提取图片链接
///
/// 支持两种语法:
/// - Obsidian: `![[image.png]]`
/// - Markdown: `![alt](path/to/image.png)`
pub fn extract_image_links(content: &str) -> Vec<ImageLink> {
    let mut links = Vec::new();

    // Obsidian 语法: ![[path]]
    let obsidian_re = Regex::new(r"!\[\[([^\]]+)\]\]").unwrap();
    for cap in obsidian_re.captures_iter(content) {
        if let Some(path_match) = cap.get(1) {
            let path = path_match.as_str().to_string();
            let position = cap.get(0).unwrap().start();

            links.push(ImageLink {
                path,
                position,
                context: String::new(), // Will be filled by caller if needed
                syntax_type: ImageSyntaxType::Obsidian,
            });
        }
    }

    // Markdown 语法: ![alt](path)
    let markdown_re = Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").unwrap();
    for cap in markdown_re.captures_iter(content) {
        if let Some(path_match) = cap.get(2) {
            let path = path_match.as_str().to_string();
            let position = cap.get(0).unwrap().start();

            links.push(ImageLink {
                path,
                position,
                context: String::new(),
                syntax_type: ImageSyntaxType::Markdown,
            });
        }
    }

    // 按位置排序
    links.sort_by_key(|link| link.position);
    links
}

/// 提取图片前后 N 个字符作为上下文
///
/// # 参数
/// - `content`: 完整文本
/// - `image_pos`: 图片在文本中的位置 (字节位置)
/// - `context_chars`: 前后各提取多少字符
pub fn extract_context(content: &str, image_pos: usize, context_chars: usize) -> String {
    // 转换为字符数组以安全处理 UTF-8
    let chars: Vec<char> = content.chars().collect();

    // 找到 image_pos 对应的字符索引
    let mut byte_count = 0;
    let mut char_pos = 0;

    for (i, ch) in chars.iter().enumerate() {
        if byte_count >= image_pos {
            char_pos = i;
            break;
        }
        byte_count += ch.len_utf8();
    }

    // 计算前后边界
    let start_char = if char_pos > context_chars {
        char_pos - context_chars
    } else {
        0
    };

    let end_char = (char_pos + context_chars).min(chars.len());

    // 转换回字符串
    chars[start_char..end_char].iter().collect()
}

/// 提取图片所在标题section下的所有文字
///
/// # 参数
/// - `content`: 完整文本
/// - `image_pos`: 图片在文本中的位置
///
/// # 返回
/// 当前标题下的所有文字内容
pub fn extract_section_context(content: &str, image_pos: usize) -> String {
    // 找到图片之前最近的标题
    let before_image = &content[..image_pos];
    let header_re = Regex::new(r"(?m)^(#{1,6})\s+(.+)$").unwrap();

    let current_header_pos = header_re
        .captures_iter(before_image)
        .last()
        .and_then(|cap| cap.get(0))
        .map(|m| m.start());

    if let Some(header_start) = current_header_pos {
        // 找到当前section的结束位置 (下一个同级或更高级标题)
        let after_header = &content[header_start..];

        // 获取当前标题级别
        let current_level = header_re
            .captures(after_header)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().len())
            .unwrap_or(1);

        // 查找下一个同级或更高级标题
        let mut section_end = content.len();

        for cap in header_re.captures_iter(&content[header_start + 1..]) {
            if let Some(level_match) = cap.get(1) {
                let level = level_match.as_str().len();
                if level <= current_level {
                    section_end = header_start + 1 + cap.get(0).unwrap().start();
                    break;
                }
            }
        }

        content[header_start..section_end].to_string()
    } else {
        // 没有标题，返回全部内容
        content.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_obsidian_syntax() {
        let markdown = r#"这是一段文字。

![[travel/paris.jpg]]

这是图片后的文字。
"#;

        let links = extract_image_links(markdown);

        assert_eq!(links.len(), 1, "应该提取到 1 个图片链接");
        assert_eq!(links[0].path, "travel/paris.jpg");
        assert_eq!(links[0].syntax_type, ImageSyntaxType::Obsidian);
    }

    #[test]
    fn test_extract_markdown_syntax() {
        let markdown = r#"这是一段文字。

![埃菲尔铁塔](images/eiffel.png)

这是图片后的文字。
"#;

        let links = extract_image_links(markdown);

        assert_eq!(links.len(), 1, "应该提取到 1 个图片链接");
        assert_eq!(links[0].path, "images/eiffel.png");
        assert_eq!(links[0].syntax_type, ImageSyntaxType::Markdown);
    }

    #[test]
    fn test_context_extraction() {
        let content = "前面的文字内容。![[image.png]]后面的文字内容。";
        let image_pos = content.find("![[").unwrap();

        let context = extract_context(content, image_pos, 10);

        assert!(context.contains("前面的文字"), "上下文应包含图片前面的文字");
        assert!(context.contains("后面的文字"), "上下文应包含图片后面的文字");
    }

    #[test]
    fn test_section_context() {
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

        assert!(context.contains("巴黎之旅"), "上下文应包含当前标题");
        assert!(context.contains("埃菲尔铁塔"), "上下文应包含标题下的内容");
        assert!(!context.contains("伦敦"), "上下文不应包含其他section");
    }

    #[test]
    fn test_multiple_images() {
        let markdown = r#"
![[image1.png]]

一些文字

![描述](image2.jpg)

更多文字

![[image3.png]]
"#;

        let links = extract_image_links(markdown);

        assert_eq!(links.len(), 3, "应该识别 3 个图片");
        assert_eq!(links[0].path, "image1.png");
        assert_eq!(links[0].syntax_type, ImageSyntaxType::Obsidian);
        assert_eq!(links[1].path, "image2.jpg");
        assert_eq!(links[1].syntax_type, ImageSyntaxType::Markdown);
        assert_eq!(links[2].path, "image3.png");
        assert_eq!(links[2].syntax_type, ImageSyntaxType::Obsidian);
    }

    #[test]
    fn test_no_images() {
        let markdown = "这是一段没有图片的文本。\n只有普通的文字。";

        let links = extract_image_links(markdown);

        assert_eq!(links.len(), 0, "无图片文本应返回空列表");
    }
}

#[cfg(test)]
mod debug_tests {
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

use serde::{Deserialize, Serialize};

/// 文本切片结构
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Chunk {
    /// 切片内容
    pub content: String,
    /// 父级标题路径 (如 ["# 一级标题", "## 二级标题"])
    pub header_path: Vec<String>,
    /// 在原文中的起始位置
    pub start_pos: usize,
    /// 在原文中的结束位置
    pub end_pos: usize,
}

/// 标题结构
#[derive(Debug, Clone, PartialEq)]
struct Header {
    level: usize,    // 标题级别 (1 = H1, 2 = H2, etc.)
    text: String,    // 标题文本
    position: usize, // 在原文中的位置
}

/// 将 Markdown 文本切分为语义块
///
/// # 策略
/// 1. 优先按 H1/H2 标题分块
/// 2. 保留父级标题作为上下文路径
/// 3. 控制切片长度在 500-800 字符
/// 4. 超长段落使用递归字符切分兜底
///
/// # 参数
/// - `content`: Markdown 文本内容
///
/// # 返回
/// 切片列表，每个切片包含内容、标题路径和位置信息
pub fn chunk_markdown(content: &str) -> Vec<Chunk> {
    if content.is_empty() {
        return Vec::new();
    }

    let headers = extract_headers(content);

    if headers.is_empty() {
        // 无标题，处理为单个块或按长度切分
        let mut chunks = Vec::new();
        if content.len() <= 800 {
            chunks.push(Chunk {
                content: content.to_string(),
                header_path: Vec::new(),
                start_pos: 0,
                end_pos: content.len(),
            });
        } else {
            // 超长无标题文本，递归切分
            let parts = recursive_split(content, 800);
            let mut pos = 0;
            for part in parts {
                let end = pos + part.len();
                chunks.push(Chunk {
                    content: part,
                    header_path: Vec::new(),
                    start_pos: pos,
                    end_pos: end,
                });
                pos = end;
            }
        }
        return chunks;
    }

    split_by_headers(content, headers)
}

/// 提取 Markdown 标题
fn extract_headers(content: &str) -> Vec<Header> {
    let mut headers = Vec::new();

    for (line_idx, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();

        // 检查是否是标题 (# 开头)
        if trimmed.starts_with('#') {
            // 计算标题级别
            let level = trimmed.chars().take_while(|&c| c == '#').count();

            // 提取标题文本 (去掉 # 和前后空格)
            let text = trimmed[level..].trim().to_string();

            if !text.is_empty() {
                // 计算在原文中的位置
                let position = content.lines().take(line_idx).map(|l| l.len() + 1).sum();

                headers.push(Header {
                    level,
                    text,
                    position,
                });
            }
        }
    }

    headers
}

/// 按标题分块
fn split_by_headers(content: &str, headers: Vec<Header>) -> Vec<Chunk> {
    let mut chunks = Vec::new();

    for (i, header) in headers.iter().enumerate() {
        // 确定该块的结束位置 (下一个标题的位置，无论级别)
        let end_pos = headers
            .get(i + 1)
            .map(|h| h.position)
            .unwrap_or(content.len());

        // 提取内容
        let chunk_content = &content[header.position..end_pos];

        // 构建标题路径: 从索引 0 到当前 i，找出所有父级和当前标题
        let mut header_path = Vec::new();
        let mut path_stack: Vec<(usize, String)> = Vec::new();

        for j in 0..=i {
            let h = &headers[j];
            let formatted_header = format!("{} {}", "#".repeat(h.level), h.text);

            // 移除所有级别 >= 当前级别的标题 (因为它们是兄弟或更深层级)
            while let Some(&(level, _)) = path_stack.last() {
                if level >= h.level {
                    path_stack.pop();
                } else {
                    break;
                }
            }

            // 添加当前标题
            path_stack.push((h.level, formatted_header.clone()));

            // 如果是当前处理的标题，构建完整路径
            if j == i {
                header_path = path_stack.iter().map(|(_, s)| s.clone()).collect();
            }
        }

        // 如果内容太长，需要进一步切分
        if chunk_content.len() > 850 {
            let parts = recursive_split(chunk_content, 800);
            let mut pos = header.position;
            for part in parts {
                let end = pos + part.len();
                chunks.push(Chunk {
                    content: part,
                    header_path: header_path.clone(),
                    start_pos: pos,
                    end_pos: end,
                });
                pos = end;
            }
        } else {
            chunks.push(Chunk {
                content: chunk_content.to_string(),
                header_path,
                start_pos: header.position,
                end_pos: end_pos,
            });
        }
    }

    chunks
}

/// 递归字符切分 (兜底策略)
///
/// 当文本块超过 max_len 但没有标题可分割时使用
fn recursive_split(content: &str, max_len: usize) -> Vec<String> {
    let mut parts = Vec::new();

    if content.len() <= max_len {
        parts.push(content.to_string());
        return parts;
    }

    // 按换行符优先切分
    let lines: Vec<&str> = content.lines().collect();
    let mut current_chunk = String::new();

    for line in lines {
        let line_with_newline = format!("{}\n", line);

        if current_chunk.len() + line_with_newline.len() > max_len {
            if !current_chunk.is_empty() {
                parts.push(current_chunk.trim_end().to_string());
                current_chunk = String::new();
            }

            // 如果单行就超过 max_len，强制切分
            if line.len() > max_len {
                // 按字符切分以避免 UTF-8 边界错误
                let chars: Vec<char> = line.chars().collect();
                let mut char_idx = 0;

                while char_idx < chars.len() {
                    let mut byte_count = 0;
                    let mut end_char_idx = char_idx;

                    while end_char_idx < chars.len() && byte_count < max_len {
                        let char_bytes = chars[end_char_idx].len_utf8();
                        if byte_count + char_bytes <= max_len {
                            byte_count += char_bytes;
                            end_char_idx += 1;
                        } else {
                            break;
                        }
                    }

                    if end_char_idx > char_idx {
                        let chunk: String = chars[char_idx..end_char_idx].iter().collect();
                        parts.push(chunk);
                        char_idx = end_char_idx;
                    } else {
                        let chunk: String = chars[char_idx..char_idx + 1].iter().collect();
                        parts.push(chunk);
                        char_idx += 1;
                    }
                }
            } else {
                current_chunk = line_with_newline;
            }
        } else {
            current_chunk.push_str(&line_with_newline);
        }
    }

    if !current_chunk.is_empty() {
        parts.push(current_chunk.trim_end().to_string());
    }

    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_header_split() {
        let markdown = r#"# 一级标题

这是一级标题下的内容。

## 二级标题 A

这是二级标题 A 的内容。

## 二级标题 B

这是二级标题 B 的内容。

# 另一个一级标题

这是另一个一级标题的内容。
"#;

        let chunks = chunk_markdown(markdown);

        // 应该产生至少 3 个切片
        assert!(
            chunks.len() >= 3,
            "应该至少有 3 个切片，实际: {}",
            chunks.len()
        );

        // 验证第一个切片包含一级标题内容
        let first_chunk = &chunks[0];
        assert!(
            first_chunk.content.contains("一级标题下的内容"),
            "第一个切片应包含一级标题的内容"
        );
        assert_eq!(
            first_chunk.header_path,
            vec!["# 一级标题"],
            "第一个切片的标题路径应该是 ['# 一级标题']"
        );

        // 验证二级标题切片有正确的父级路径
        let has_nested_header = chunks.iter().any(|chunk| {
            chunk.header_path.len() == 2
                && chunk.header_path[0] == "# 一级标题"
                && chunk.header_path[1].starts_with("## 二级标题")
        });
        assert!(has_nested_header, "应该有包含嵌套标题路径的切片");
    }

    #[test]
    fn test_length_control() {
        // 创建一个包含长段落的 Markdown
        let long_paragraph = "这是一个很长的段落。".repeat(100); // 约 1000 字符
        let markdown = format!("# 标题\n\n{}", long_paragraph);

        let chunks = chunk_markdown(&markdown);

        // 验证每个切片长度在合理范围内
        for chunk in &chunks {
            assert!(
                chunk.content.len() <= 850,
                "切片长度 {} 超过了 850 字符上限",
                chunk.content.len()
            );
        }

        // 对于超长内容，应该产生多个切片
        if long_paragraph.len() > 800 {
            assert!(chunks.len() > 1, "超长段落应该被切分为多个切片");
        }
    }

    #[test]
    fn test_recursive_split() {
        let long_text = "A".repeat(2000); // 2000 个字符，无标题
        let max_len = 800;

        let parts = recursive_split(&long_text, max_len);

        // 应该被切分为至少 3 部分
        assert!(parts.len() >= 3, "2000 字符应该被切分为至少 3 个部分");

        // 验证每部分长度不超过 max_len
        for part in &parts {
            assert!(
                part.len() <= max_len,
                "切分后的部分长度 {} 不应超过 {}",
                part.len(),
                max_len
            );
        }

        // 验证拼接后与原文相同
        let reconstructed = parts.join("");
        assert_eq!(reconstructed, long_text, "切分后拼接应该还原原文");
    }

    #[test]
    fn test_header_path_preservation() {
        let markdown = r#"# Level 1

Content under L1.

## Level 2

Content under L2.

### Level 3

Content under L3.
"#;

        let chunks = chunk_markdown(markdown);

        // 查找 Level 3 的切片
        let level3_chunk = chunks
            .iter()
            .find(|chunk| chunk.content.contains("Content under L3"));

        assert!(level3_chunk.is_some(), "应该有 Level 3 的切片");

        let level3_chunk = level3_chunk.unwrap();

        // 验证完整的标题路径被保留
        assert_eq!(
            level3_chunk.header_path,
            vec!["# Level 1", "## Level 2", "### Level 3"],
            "应该保留完整的标题层级路径"
        );
    }

    #[test]
    fn test_empty_content() {
        let empty = "";
        let chunks = chunk_markdown(empty);
        assert_eq!(chunks.len(), 0, "空内容应该返回空切片列表");
    }

    #[test]
    fn test_no_headers() {
        let plain_text =
            "这是一段没有标题的纯文本。\n它包含多行内容。\n但是没有任何 Markdown 标题。";

        let chunks = chunk_markdown(plain_text);

        // 应该至少有一个切片
        assert!(chunks.len() >= 1, "无标题文本应该产生至少一个切片");

        // 第一个切片应该包含所有内容
        let first_chunk = &chunks[0];
        assert!(
            first_chunk.content.contains("没有标题的纯文本"),
            "切片应该包含原始内容"
        );

        // 标题路径应该为空
        assert_eq!(
            first_chunk.header_path.len(),
            0,
            "无标题文本的标题路径应该为空"
        );
    }

    #[test]
    fn test_extract_headers() {
        let markdown = r#"# Header 1
## Header 2
### Header 3
Not a header
#### Header 4
"#;

        let headers = extract_headers(markdown);

        assert_eq!(headers.len(), 4, "应该提取到 4 个标题");
        assert_eq!(headers[0].level, 1);
        assert_eq!(headers[0].text, "Header 1");
        assert_eq!(headers[1].level, 2);
        assert_eq!(headers[1].text, "Header 2");
        assert_eq!(headers[2].level, 3);
        assert_eq!(headers[3].level, 4);
    }
}



import sys
import os

def extract_block(content, start_str, is_func=True):
    idx = content.find(start_str)
    if idx == -1:
        return content, None
    
    # find the matching closing brace
    brace_count = 0
    in_str = False
    str_char = ''
    in_comment = False
    i = idx
    start_brace = -1
    
    # Find the first brace
    while i < len(content):
        if content[i] == '{':
            brace_count = 1
            start_brace = i
            i += 1
            break
        i += 1
        
    if start_brace == -1:
        return content, None
        
    while i < len(content):
        c = content[i]
        if not in_comment and not in_str:
            if c == '{':
                brace_count += 1
            elif c == '}':
                brace_count -= 1
                if brace_count == 0:
                    break
            elif c in ('"', "'", '`'):
                in_str = True
                str_char = c
            elif c == '/' and i + 1 < len(content) and content[i+1] == '/':
                in_comment = True
        elif in_str:
            if c == str_char and content[i-1] != '\\':
                in_str = False
        elif in_comment:
            if c == '\n':
                in_comment = False
        i += 1
        
    end_idx = i + 1
    block = content[idx:end_idx]
    
    # Remove the block from content
    new_content = content[:idx] + content[end_idx:]
    return new_content, block

def extract_var(content, var_name):
    start_str = f"export const {var_name}"
    idx = content.find(start_str)
    if idx == -1:
        start_str = f"const {var_name}"
        idx = content.find(start_str)
        if idx == -1:
            return content, None
            
    # find semicolon or end of line or end of block
    i = idx
    brace_count = 0
    while i < len(content):
        if content[i] == '{' or content[i] == '[':
            brace_count += 1
        elif content[i] == '}' or content[i] == ']':
            brace_count -= 1
        elif content[i] == ';' and brace_count == 0:
            i += 1
            break
        i += 1
        
    block = content[idx:i]
    new_content = content[:idx] + content[i:]
    return new_content, block

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Example usage:
    # content, block = extract_block(content, "function DealModal(")
    # print(block)
    
    print("Python extractor ready.")

if __name__ == '__main__':
    main()

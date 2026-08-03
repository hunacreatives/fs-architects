import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactRenderer, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Mention from '@tiptap/extension-mention';
import { Extension, type Editor } from '@tiptap/core';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import type { TeamMember } from '@/pages/hub/components/TaskDetailPanel';

// ── Mention suggestion dropdown ───────────────────────────────────────────────

interface MentionListHandle {
  onKeyDown: (args: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: TeamMember[];
  command: (attrs: { id: string; label: string }) => void;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>((props, ref) => {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [props.items]);

  const select = (i: number) => {
    const item = props.items[i];
    if (item) props.command({ id: item.id, label: item.full_name.split(' ')[0] });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (props.items.length === 0) return false;
      if (event.key === 'ArrowUp') { setIndex(i => (i + props.items.length - 1) % props.items.length); return true; }
      if (event.key === 'ArrowDown') { setIndex(i => (i + 1) % props.items.length); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { select(index); return true; }
      return false;
    },
  }));

  if (props.items.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[180px] py-1">
      {props.items.map((item, i) => (
        <button key={item.id} type="button" onMouseDown={e => { e.preventDefault(); select(i); }}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm cursor-pointer transition-colors ${i === index ? 'bg-gray-50' : ''} hover:bg-gray-50`}>
          <HubAvatar fullName={item.full_name} avatarUrl={item.avatar_url} size="w-5 h-5" />
          <span className="text-gray-700">{item.full_name}</span>
        </button>
      ))}
    </div>
  );
});
MentionList.displayName = 'MentionList';

// ── Editor component ──────────────────────────────────────────────────────────

export interface CommentEditorHandle {
  getHTML: () => string;
  getText: () => string;
  isEmpty: () => boolean;
  clear: () => void;
  focus: () => void;
}

interface CommentEditorProps {
  users: TeamMember[];
  placeholder?: string;
  initialHTML?: string;
  autoFocus?: boolean;
  minHeight?: number;
  onSubmit?: () => void;
  onTextChange?: (text: string) => void;
  className?: string;
}

const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#111827'];

const CommentEditor = forwardRef<CommentEditorHandle, CommentEditorProps>(function CommentEditor(
  { users, placeholder = 'Add a comment…', initialHTML = '', autoFocus = false, minHeight = 60, onSubmit, onTextChange, className = '' },
  ref,
) {
  const usersRef = useRef(users);
  usersRef.current = users;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onTextChangeRef = useRef(onTextChange);
  onTextChangeRef.current = onTextChange;
  const suggestionOpenRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: { openOnClick: false },
      }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      Extension.create({
        name: 'submitOnEnter',
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (suggestionOpenRef.current) return false;
              onSubmitRef.current?.();
              return true;
            },
            'Shift-Enter': () => this.editor.commands.setHardBreak(),
          };
        },
      }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: ({ query }: { query: string }) =>
            usersRef.current
              .filter(u => u.full_name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 6),
          render: () => {
            let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
            let popup: HTMLDivElement | null = null;

            const reposition = (clientRect?: (() => DOMRect | null) | null, attempt = 0) => {
              if (!popup) return;
              const rect = clientRect?.();
              if (!rect) return;
              // ReactRenderer paints asynchronously — wait until the popup has real
              // dimensions before placing it, or the flip math lands it far away.
              if (!popup.offsetHeight && attempt < 10) {
                requestAnimationFrame(() => reposition(clientRect, attempt + 1));
                return;
              }
              const height = popup.offsetHeight;
              const width = popup.offsetWidth || 180;
              const below = rect.bottom + 6 + height <= window.innerHeight;
              popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
              popup.style.top = below ? `${rect.bottom + 6}px` : `${rect.top - height - 6}px`;
              popup.style.visibility = 'visible';
            };

            const destroy = () => {
              suggestionOpenRef.current = false;
              popup?.remove();
              component?.destroy();
              component = null;
              popup = null;
            };

            return {
              onStart: (props: any) => {
                suggestionOpenRef.current = true;
                component = new ReactRenderer(MentionList, { props, editor: props.editor });
                popup = document.createElement('div');
                popup.style.position = 'fixed';
                popup.style.zIndex = '100';
                popup.style.visibility = 'hidden';
                popup.appendChild(component.element);
                document.body.appendChild(popup);
                reposition(props.clientRect);
              },
              onUpdate: (props: any) => {
                component?.updateProps(props);
                reposition(props.clientRect);
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') { destroy(); return true; }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: destroy,
            };
          },
        },
      }),
    ],
    content: initialHTML,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor }) => onTextChangeRef.current?.(editor.getText()),
  });

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() ?? '',
    getText: () => editor?.getText() ?? '',
    isEmpty: () => editor?.isEmpty ?? true,
    clear: () => editor?.commands.clearContent(true),
    focus: () => editor?.commands.focus('end'),
  }), [editor]);

  return (
    <div className={`comment-editor ${className}`} style={{ ['--ce-min-h' as string]: `${minHeight}px` }}>
      {editor && <SelectionToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
});

function SelectionToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }: { editor: Editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
    }),
  });

  const btn = (isActive: boolean) =>
    `w-7 h-7 flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors ${isActive ? 'bg-white/20 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'}`;

  return (
    <BubbleMenu editor={editor} options={{ placement: 'top' }}
      shouldShow={({ editor, state }) => editor.isEditable && !state.selection.empty}>
      <div className="flex items-center gap-0.5 bg-[#111827] rounded-lg shadow-xl px-1 py-1">
        <button type="button" title="Bold" className={btn(active?.bold ?? false)}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}>
          <i className="ri-bold"></i>
        </button>
        <button type="button" title="Italic" className={btn(active?.italic ?? false)}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}>
          <i className="ri-italic"></i>
        </button>
        <button type="button" title="Underline" className={btn(active?.underline ?? false)}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}>
          <i className="ri-underline"></i>
        </button>
        <button type="button" title="Strikethrough" className={btn(active?.strike ?? false)}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}>
          <i className="ri-strikethrough"></i>
        </button>
        <div className="w-px h-4 bg-white/15 mx-0.5" />
        {COLORS.map(col => (
          <button key={col} type="button" title="Text color"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(col).run(); }}
            className="w-4 h-4 rounded-full cursor-pointer hover:scale-110 transition-transform border border-white/30 mx-0.5"
            style={{ background: col }} />
        ))}
      </div>
    </BubbleMenu>
  );
}

export default CommentEditor;

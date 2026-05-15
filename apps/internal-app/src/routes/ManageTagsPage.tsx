import React, { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tag01Icon,
  Add01Icon,
  PencilEdit02Icon,
  Cancel01Icon,
  Delete02Icon,
  CheckmarkCircle02Icon
} from "@hugeicons/core-free-icons";
import { initialTags } from "../data/mockData";
import toast from "react-hot-toast";

export default function ManageTagsPage() {
  const [tags, setTags] = useState(() => {
    const saved = localStorage.getItem("turtle_tags");
    return saved ? JSON.parse(saved) : initialTags;
  });
  const [newTag, setNewTag] = useState("");
  const [editingIndex, setEditingIndex] = useState<any>(null);
  const [editingValue, setEditingValue] = useState("");

  useEffect(() => {
    localStorage.setItem("turtle_tags", JSON.stringify(tags));
  }, [tags]);

  const handleAddTag = (e: any) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    if (tags.includes(newTag.trim())) {
      toast.error("Tag already exists");
      return;
    }
    setTags([...tags, newTag.trim()]);
    setNewTag("");
    toast.success("Tag added successfully");
  };

  const handleDeleteTag = (tagToDelete: any) => {
    toast((t) => (
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-ink">
          Delete tag <b className="text-red">"{tagToDelete}"</b>?
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setTags(tags.filter((tag: any) => tag !== tagToDelete));
              toast.dismiss(t.id);
              toast.success("Tag deleted", { icon: "🗑️" });
            }}
            className="px-2 py-1 bg-red text-white text-[10px] font-black rounded-md hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-2 py-1 bg-surface-soft text-muted text-[10px] font-black rounded-md hover:bg-line transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    ), {
      duration: 5000,
      style: {
        minWidth: '280px',
        padding: '12px',
        borderRadius: '12px',
        border: '1px solid #eee',
      },
    });
  };

  const startEditing = (index: any, value: any) => {
    setEditingIndex(index);
    setEditingValue(value);
  };

  const handleSaveEdit = (index: any) => {
    if (!editingValue.trim()) return;
    const newTags = [...tags];
    newTags[index] = editingValue.trim();
    setTags(newTags);
    setEditingIndex(null);
    toast.success("Tag updated");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-ink mb-2">Manage Tags</h1>
        <p className="text-muted">Create and manage tags that can be assigned to clients.</p>
      </header>

      <div className="grid gap-6">
        <section className="p-6 border border-line rounded-2xl bg-white shadow-sm">
          <h2 className="text-lg font-black mb-4 flex items-center gap-2">
            <HugeiconsIcon icon={Add01Icon} size={20} className="text-green" />
            Add New Tag
          </h2>
          <form onSubmit={handleAddTag} className="flex gap-3">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Enter tag name..."
              className="flex-1 min-h-[44px] px-4 border border-line rounded-xl outline-none focus:border-green transition-colors"
            />
            <button
              type="submit"
              className="px-6 bg-green text-ink font-black rounded-xl hover:bg-[#26c4a8] transition-colors flex items-center gap-2"
            >
              <HugeiconsIcon icon={Add01Icon} size={18} />
              Add Tag
            </button>
          </form>
        </section>

        <section className="p-6 border border-line rounded-2xl bg-white shadow-sm">
          <h2 className="text-lg font-black mb-4 flex items-center gap-2">
            <HugeiconsIcon icon={Tag01Icon} size={20} className="text-green" />
            Current Tags ({tags.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tags.map((tag: any, index: any) => (
              <div
                key={index}
                className="group flex items-center justify-between p-3 border border-line rounded-xl hover:border-green hover:bg-[rgba(46,222,190,0.02)] transition-all"
              >
                {editingIndex === index ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      autoFocus
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="flex-1 px-2 py-1 border border-green rounded-md outline-none text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(index)}
                    />
                    <button
                      onClick={() => handleSaveEdit(index)}
                      className="p-1 text-green hover:bg-green/10 rounded"
                    >
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
                    </button>
                    <button
                      onClick={() => setEditingIndex(null)}
                      className="p-1 text-red hover:bg-red/10 rounded"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-bold text-ink truncate">{tag}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditing(index, tag)}
                        className="p-1.5 text-muted hover:text-ink hover:bg-surface-soft rounded-lg"
                        title="Edit Tag"
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag)}
                        className="p-1.5 text-muted hover:text-red hover:bg-red/5 rounded-lg"
                        title="Delete Tag"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
} from "react";

import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  CheckSquare,
  ChevronDown,
  Download,
  FileText,
  FolderOpen,
  Mail,
  MousePointer2,
  PenLine,
  Pencil,
  Redo2,
  Save,
  Type,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  X,
} from "lucide-react";

import DocumentViewer from "./components/editor/DocumentViewer";
import ImageViewer from "./components/editor/ImageViewer";
import DocxViewer from "./components/editor/DocxViewer";

import type {
  DocumentField,
  FieldType,
} from "./types/document";

import {
  downloadExportedPdf,
} from "./utils/exportPdf";

import {
  exportImage,
} from "./utils/exportImage";

import {
  downloadExportedDocx,
} from "./utils/exportDocx";

import "./index.css";

/* =========================================
   TOOL TYPES
   ========================================= */

type Tool =
  | "select"
  | FieldType;

/* =========================================
   TOOL CONFIGURATION
   ========================================= */

interface ToolItem {
  id: Tool;
  label: string;
  icon: ComponentType<{
    size?: number;
  }>;
}

const tools: ToolItem[] = [
  {
    id: "select",
    label: "Select",
    icon: MousePointer2,
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
  },
  {
    id: "signature",
    label: "Signature",
    icon: PenLine,
  },
  {
    id: "date",
    label: "Date",
    icon: CalendarDays,
  },
  {
    id: "checkbox",
    label: "Checkbox",
    icon: CheckSquare,
  },
  {
    id: "name",
    label: "Name",
    icon: UserRound,
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
  },
];

/* =========================================
   SAVE DATA
   ========================================= */

interface SavedDocumentState {
  fileName: string;
  fileSize: number;
  lastModified: number;
  fields: DocumentField[];
  savedAt: number;
}

interface LibraryDocument {
  id: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  fileType: string;
  fields: DocumentField[];
  savedAt: number;
  createdAt: number;
  blob: Blob;
}

const SAVE_STORAGE_PREFIX =
  "signflow-document:";

const DOCUMENT_LIBRARY_DB = "signflow-library";
const DOCUMENT_LIBRARY_STORE = "documents";

const openDocumentLibrary = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      DOCUMENT_LIBRARY_DB,
      1,
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DOCUMENT_LIBRARY_STORE)) {
        db.createObjectStore(
          DOCUMENT_LIBRARY_STORE,
          { keyPath: "id" },
        );
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const getLibraryDocuments = async (): Promise<LibraryDocument[]> => {
  const db = await openDocumentLibrary();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      DOCUMENT_LIBRARY_STORE,
      "readonly",
    );
    const store = transaction.objectStore(
      DOCUMENT_LIBRARY_STORE,
    );
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      const documents = (request.result as LibraryDocument[]).sort(
        (a, b) => b.savedAt - a.savedAt,
      );
      resolve(documents);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

const saveLibraryDocument = async (
  document: LibraryDocument,
): Promise<void> => {
  const db = await openDocumentLibrary();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      DOCUMENT_LIBRARY_STORE,
      "readwrite",
    );
    const store = transaction.objectStore(
      DOCUMENT_LIBRARY_STORE,
    );

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    store.put(document);
  });
};

const deleteLibraryDocument = async (
  id: string,
): Promise<void> => {
  const db = await openDocumentLibrary();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      DOCUMENT_LIBRARY_STORE,
      "readwrite",
    );
    const store = transaction.objectStore(
      DOCUMENT_LIBRARY_STORE,
    );

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    store.delete(id);
  });
};

const createLibraryId = (file: File): string =>
  `${file.name}:${file.size}:${file.lastModified}`;

const getStorageKey = (
  selectedFile: File,
): string => {
  return `${SAVE_STORAGE_PREFIX}${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`;
};

const getTimestamp = (): number => Date.now();

const cloneFields = (
  source: DocumentField[],
): DocumentField[] => {
  return source.map(
    (field) => ({
      ...field,
    }),
  );
};

/* =========================================
   CONSTANTS
   ========================================= */

const MIN_ZOOM = 50;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;

/* =========================================
   APP
   ========================================= */

function App() {
  /* =========================================
     DOCUMENT
     ========================================= */

  const [file, setFile] =
    useState<File | null>(null);

  const [libraryDocuments, setLibraryDocuments] =
    useState<LibraryDocument[]>([]);

  const [librarySearch, setLibrarySearch] =
    useState("");

  const [editingDocumentId, setEditingDocumentId] =
    useState<string | null>(null);

  const [editingDocumentName, setEditingDocumentName] =
    useState("");

  const [isLibraryLoading, setIsLibraryLoading] =
    useState(true);

  /* =========================================
     TOOL
     ========================================= */

  const [tool, setTool] =
    useState<Tool>(
      "select",
    );

  /* =========================================
     FIELDS
     ========================================= */

  const [fields, setFields] =
    useState<DocumentField[]>(
      [],
    );

  const [
    docxDocumentElement,
    setDocxDocumentElement,
  ] =
    useState<HTMLDivElement | null>(
      null,
    );

  const [
    selectedFieldId,
    setSelectedFieldId,
  ] =
    useState<string | null>(
      null,
    );

  /* =========================================
     EXPORT
     ========================================= */

  const [
    isExporting,
    setIsExporting,
  ] =
    useState(false);

  /* =========================================
     UNDO / REDO
     ========================================= */

  const [
    past,
    setPast,
  ] =
    useState<DocumentField[][]>(
      [],
    );

  const [
    future,
    setFuture,
  ] =
    useState<DocumentField[][]>(
      [],
    );

  const pastRef =
    useRef<DocumentField[][]>(
      [],
    );

  const futureRef =
    useRef<DocumentField[][]>(
      [],
    );

  /* =========================================
     SAVE STATE
     ========================================= */

  const [
    isSaved,
    setIsSaved,
  ] =
    useState(false);

  /* =========================================
     ZOOM
     ========================================= */

  const [
    zoom,
    setZoom,
  ] =
    useState(100);

  /* =========================================
     FIELD REFERENCE
     ========================================= */

  const fieldsRef =
    useRef<DocumentField[]>(
      [],
    );

  const historySnapshotRef =
    useRef<DocumentField[] | null>(
      null,
    );

  const historyTimerRef =
    useRef<number | null>(
      null,
    );

  const documentSessionRef =
    useRef(0);

  /* =========================================
     FIELD REF SYNCHRONIZATION
     ========================================= */

  useEffect(() => {
    fieldsRef.current =
      fields;
  }, [fields]);

  useEffect(() => {
    let mounted = true;

    const loadLibrary = async () => {
      try {
        const documents = await getLibraryDocuments();
        if (mounted) {
          setLibraryDocuments(documents);
        }
      } catch (error) {
        console.warn(
          "Unable to load the SignFlow document library.",
          error,
        );
      } finally {
        if (mounted) {
          setIsLibraryLoading(false);
        }
      }
    };

    void loadLibrary();

    return () => {
      mounted = false;
    };
  }, []);

  /* =========================================
     HISTORY CLEANUP
     ========================================= */

  useEffect(() => {
    return () => {
      if (
        historyTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          historyTimerRef.current,
        );

        historyTimerRef.current =
          null;
      }
    };
  }, []);

  /* =========================================
     FILE TYPE
     ========================================= */

  const isPdf =
    file?.type ===
      "application/pdf" ||
    Boolean(
      file?.name
        .toLowerCase()
        .endsWith(".pdf"),
    );

  const isImage =
    file?.type ===
      "image/png" ||
    file?.type ===
      "image/jpeg" ||
    Boolean(
      file?.name
        .toLowerCase()
        .match(
          /\.(png|jpe?g)$/i,
        ),
    );

  const isDocx =
    Boolean(
      file?.name
        .toLowerCase()
        .endsWith(".docx"),
    );

  /* =========================================
     HISTORY HELPERS
     ========================================= */

  const clearHistoryTimer =
    useCallback(() => {
      if (
        historyTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          historyTimerRef.current,
        );

        historyTimerRef.current =
          null;
      }
    }, []);

  const pushPastSnapshot =
    useCallback(
      (
        snapshot: DocumentField[],
      ) => {
        const cloned =
          cloneFields(
            snapshot,
          );

        const nextPast = [
          ...pastRef.current,
          cloned,
        ];

        pastRef.current =
          nextPast;

        setPast(
          nextPast,
        );
      },
      [],
    );

  const clearFuture =
    useCallback(() => {
      futureRef.current =
        [];

      setFuture([]);
    }, []);

  const flushPendingHistory =
    useCallback(() => {
      clearHistoryTimer();

      const pending =
        historySnapshotRef.current;

      if (!pending) {
        return;
      }

      pushPastSnapshot(
        pending,
      );

      historySnapshotRef.current =
        null;
    }, [
      clearHistoryTimer,
      pushPastSnapshot,
    ]);

  const beginHistoryTransaction =
    useCallback(() => {
      if (
        historySnapshotRef.current ===
        null
      ) {
        historySnapshotRef.current =
          cloneFields(
            fieldsRef.current,
          );
      }

      clearHistoryTimer();

      const currentSession =
        documentSessionRef.current;

      historyTimerRef.current =
        window.setTimeout(() => {
          if (
            currentSession !==
            documentSessionRef.current
          ) {
            return;
          }

          flushPendingHistory();
        }, 350);
    }, [
      clearHistoryTimer,
      flushPendingHistory,
    ]);

  const commitFieldState =
    useCallback(
      (
        nextFields: DocumentField[],
      ) => {
        const previous =
          fieldsRef.current;

        pushPastSnapshot(
          previous,
        );

        clearFuture();

        const cloned =
          cloneFields(
            nextFields,
          );

        fieldsRef.current =
          cloned;

        setFields(
          cloned,
        );

        setIsSaved(false);
      },
      [
        pushPastSnapshot,
        clearFuture,
      ],
    );

  /* =========================================
     DOCUMENT LIBRARY
     ========================================= */

  const refreshLibrary = useCallback(async () => {
    try {
      const documents = await getLibraryDocuments();
      setLibraryDocuments(documents);
    } catch (error) {
      console.warn(
        "Unable to refresh the SignFlow document library.",
        error,
      );
    }
  }, []);

  const persistCurrentDocument = useCallback(
    async (currentFile: File, currentFields: DocumentField[]) => {
      const now = getTimestamp();
      const id = createLibraryId(currentFile);
      const existing = libraryDocuments.find(
        (document) => document.id === id,
      );

      await saveLibraryDocument({
        id,
        fileName: currentFile.name,
        fileSize: currentFile.size,
        lastModified: currentFile.lastModified,
        fileType: currentFile.type || "application/octet-stream",
        fields: cloneFields(currentFields),
        savedAt: now,
        createdAt: existing?.createdAt ?? now,
        blob: currentFile,
      });

      await refreshLibrary();
    },
    [libraryDocuments, refreshLibrary],
  );

  const handleOpenLibraryDocument = async (
    document: LibraryDocument,
  ) => {
    documentSessionRef.current += 1;
    clearHistoryTimer();
    historySnapshotRef.current = null;

    const restoredFile = new File(
      [document.blob],
      document.fileName,
      {
        type: document.fileType,
        lastModified: document.lastModified,
      },
    );

    const restoredFields = cloneFields(document.fields);

    fieldsRef.current = restoredFields;
    pastRef.current = [];
    futureRef.current = [];

    setFile(restoredFile);
    setFields(restoredFields);
    setPast([]);
    setFuture([]);
    setDocxDocumentElement(null);
    setSelectedFieldId(null);
    setTool("select");
    setZoom(100);
    setIsSaved(true);
  };

  const handleDeleteLibraryDocument = async (
    document: LibraryDocument,
  ) => {
    const confirmed = window.confirm(
      `Delete "${document.fileName}" from your SignFlow library?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteLibraryDocument(document.id);
      setLibraryDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );

      if (file && createLibraryId(file) === document.id) {
        documentSessionRef.current += 1;
        clearHistoryTimer();
        historySnapshotRef.current = null;
        fieldsRef.current = [];
        pastRef.current = [];
        futureRef.current = [];
        setFile(null);
        setFields([]);
        setPast([]);
        setFuture([]);
        setDocxDocumentElement(null);
        setSelectedFieldId(null);
        setTool("select");
        setIsExporting(false);
        setIsSaved(false);
        setZoom(100);
      }
    } catch (error) {
      console.error(
        "Unable to delete library document:",
        error,
      );
      window.alert(
        "Unable to delete this document from the library.",
      );
    }
  };

  const startRenameDocument = (document: LibraryDocument) => {
    setEditingDocumentId(document.id);
    setEditingDocumentName(document.fileName);
  };

  const cancelRenameDocument = () => {
    setEditingDocumentId(null);
    setEditingDocumentName("");
  };

  const saveRenamedDocument = async (document: LibraryDocument) => {
    const trimmedName = editingDocumentName.trim();

    if (!trimmedName) {
      return;
    }

    const originalExtension =
      document.fileName.includes(".")
        ? document.fileName.slice(document.fileName.lastIndexOf("."))
        : "";
    const hasExtension = /\.[a-z0-9]+$/i.test(trimmedName);
    const nextName = hasExtension
      ? trimmedName
      : `${trimmedName}${originalExtension}`;

    try {
      const renamedFile = new File(
        [document.blob],
        nextName,
        {
          type: document.fileType,
          lastModified: document.lastModified,
        },
      );

      const renamedDocument: LibraryDocument = {
        ...document,
        id: createLibraryId(renamedFile),
        fileName: nextName,
        blob: renamedFile,
        savedAt: getTimestamp(),
      };

      await deleteLibraryDocument(document.id);
      await saveLibraryDocument(renamedDocument);

      if (file && createLibraryId(file) === document.id) {
        setFile(renamedFile);
      }

      cancelRenameDocument();
      await refreshLibrary();
    } catch (error) {
      console.error(
        "Unable to rename library document:",
        error,
      );
      window.alert("Unable to rename this document.");
    }
  };

  const filteredLibraryDocuments =
    libraryDocuments.filter((document) =>
      document.fileName
        .toLowerCase()
        .includes(librarySearch.trim().toLowerCase()),
    );

  /* =========================================
     UPLOAD DOCUMENT
     ========================================= */

  const handleUpload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    documentSessionRef.current +=
      1;

    clearHistoryTimer();

    historySnapshotRef.current =
      null;

    setFile(
      selectedFile,
    );

    let restoredFields:
      DocumentField[] = [];

    try {
      const saved =
        window.localStorage.getItem(
          getStorageKey(
            selectedFile,
          ),
        );

      if (saved) {
        const parsed =
          JSON.parse(
            saved,
          ) as SavedDocumentState;

        if (
          Array.isArray(
            parsed.fields,
          )
        ) {
          restoredFields =
            cloneFields(
              parsed.fields,
            );
        }
      }
    } catch (error) {
      console.warn(
        "Unable to restore saved SignFlow state.",
        error,
      );
    }

    fieldsRef.current =
      restoredFields;

    setFields(
      restoredFields,
    );

    void saveLibraryDocument({
      id: createLibraryId(selectedFile),
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      lastModified: selectedFile.lastModified,
      fileType: selectedFile.type || "application/octet-stream",
      fields: cloneFields(restoredFields),
      savedAt: getTimestamp(),
      createdAt: getTimestamp(),
      blob: selectedFile,
    }).then(() => refreshLibrary()).catch((error) => {
      console.warn(
        "Unable to add the document to the SignFlow library.",
        error,
      );
    });

    pastRef.current =
      [];

    futureRef.current =
      [];

    setPast([]);

    setFuture([]);

    setDocxDocumentElement(
      null,
    );

    setSelectedFieldId(
      null,
    );

    setTool(
      "select",
    );

    setZoom(100);

    setIsSaved(
      restoredFields.length > 0,
    );

    event.target.value = "";
  };

  /* =========================================
     ADD FIELD
     ========================================= */

  const addField = (
    page: number,
    x: number,
    y: number,
    scale = 1,
  ) => {
    if (
      tool !== "text" &&
      tool !== "signature" &&
      tool !== "date" &&
      tool !== "checkbox" &&
      tool !== "name" &&
      tool !== "email"
    ) {
      return;
    }

    const isSignature =
      tool === "signature";

    const isDate =
      tool === "date";

    const isCheckbox =
      tool === "checkbox";

    const isName =
      tool === "name";

    const isEmail =
      tool === "email";

    const today =
      new Date();

    const defaultDate =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1,
      ).padStart(
        2,
        "0",
      )}-${String(
        today.getDate(),
      ).padStart(
        2,
        "0",
      )}`;

    const safeScale =
      Number.isFinite(
        scale,
      ) &&
      scale > 0
        ? scale
        : 1;

    const displayWidth =
      isSignature
        ? 320
        : isDate
          ? 180
          : isCheckbox
            ? 36
            : isName
              ? 240
              : isEmail
                ? 280
                : 200;

    const displayHeight =
      isSignature
        ? 140
        : isDate
          ? 42
          : isCheckbox
            ? 36
            : 42;

    const newField:
      DocumentField = {
      id: crypto.randomUUID(),

      type:
        isSignature
          ? "signature"
          : isDate
            ? "date"
            : isCheckbox
              ? "checkbox"
              : isName
                ? "name"
                : isEmail
                  ? "email"
                  : "text",

      page,

      x,

      y,

      width:
        displayWidth /
        safeScale,

      height:
        displayHeight /
        safeScale,

      value:
        isDate
          ? defaultDate
          : isCheckbox
            ? "false"
            : "",

      ...(isSignature
        ? {
            signatureMode:
              "draw",

            signatureImage:
              "",

            signatureFont:
              '"Brush Script MT", "Segoe Script", cursive',
          }
        : {}),
    };

    commitFieldState([
      ...fieldsRef.current,
      newField,
    ]);

    setSelectedFieldId(
      newField.id,
    );

    setTool(
      "select",
    );
  };

  /* =========================================
     UPDATE FIELD
     ========================================= */

  const updateField = (
    id: string,
    updates: Partial<DocumentField>,
  ) => {
    beginHistoryTransaction();

    const nextFields =
      fieldsRef.current.map(
        (field) => {
          if (
            field.id !== id
          ) {
            return field;
          }

          return {
            ...field,
            ...updates,
          };
        },
      );

    fieldsRef.current =
      nextFields;

    setFields(
      nextFields,
    );

    setIsSaved(false);

    clearHistoryTimer();

    const currentSession =
      documentSessionRef.current;

    historyTimerRef.current =
      window.setTimeout(() => {
        if (
          currentSession !==
          documentSessionRef.current
        ) {
          return;
        }

        flushPendingHistory();
      }, 350);
  };

  /* =========================================
     SELECT FIELD
     ========================================= */

  const selectField = (
    id: string,
  ) => {
    setSelectedFieldId(
      id,
    );

    setTool(
      "select",
    );
  };

  /* =========================================
     DELETE FIELD
     ========================================= */

  const deleteField = (
    id: string,
  ) => {
    const fieldExists =
      fieldsRef.current.some(
        (field) =>
          field.id === id,
      );

    if (!fieldExists) {
      return;
    }

    clearHistoryTimer();

    historySnapshotRef.current =
      null;

    commitFieldState(
      fieldsRef.current.filter(
        (field) =>
          field.id !== id,
      ),
    );

    setSelectedFieldId(
      (currentSelected) =>
        currentSelected === id
          ? null
          : currentSelected,
    );
  };

  /* =========================================
     UNDO
     ========================================= */

  const handleUndo = () => {
    flushPendingHistory();

    const currentPast =
      pastRef.current;

    if (
      currentPast.length ===
      0
    ) {
      return;
    }

    const previous =
      currentPast[
        currentPast.length - 1
      ];

    const remainingPast =
      currentPast.slice(
        0,
        -1,
      );

    const currentFields =
      cloneFields(
        fieldsRef.current,
      );

    const nextFuture = [
      ...futureRef.current,
      currentFields,
    ];

    pastRef.current =
      remainingPast;

    futureRef.current =
      nextFuture;

    setPast(
      remainingPast,
    );

    setFuture(
      nextFuture,
    );

    const restored =
      cloneFields(
        previous,
      );

    fieldsRef.current =
      restored;

    setFields(
      restored,
    );

    setIsSaved(false);

    setSelectedFieldId(
      (currentSelected) =>
        currentSelected &&
        restored.some(
          (field) =>
            field.id ===
            currentSelected,
        )
          ? currentSelected
          : null,
    );
  };

  /* =========================================
     REDO
     ========================================= */

  const handleRedo = () => {
    flushPendingHistory();

    const currentFuture =
      futureRef.current;

    if (
      currentFuture.length ===
      0
    ) {
      return;
    }

    const next =
      currentFuture[
        currentFuture.length - 1
      ];

    const remainingFuture =
      currentFuture.slice(
        0,
        -1,
      );

    const currentFields =
      cloneFields(
        fieldsRef.current,
      );

    const nextPast = [
      ...pastRef.current,
      currentFields,
    ];

    pastRef.current =
      nextPast;

    futureRef.current =
      remainingFuture;

    setPast(
      nextPast,
    );

    setFuture(
      remainingFuture,
    );

    const restored =
      cloneFields(
        next,
      );

    fieldsRef.current =
      restored;

    setFields(
      restored,
    );

    setIsSaved(false);

    setSelectedFieldId(
      (currentSelected) =>
        currentSelected &&
        restored.some(
          (field) =>
            field.id ===
            currentSelected,
        )
          ? currentSelected
          : null,
    );
  };

  /* =========================================
     KEYBOARD SHORTCUTS
     ========================================= */

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      const target =
        event.target;

      if (
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target instanceof
          HTMLSelectElement
      ) {
        return;
      }

      const modifier =
        event.ctrlKey ||
        event.metaKey;

      if (!modifier) {
        return;
      }

      if (
        event.key.toLowerCase() ===
        "z"
      ) {
        event.preventDefault();

        if (
          event.shiftKey
        ) {
          handleRedo();
        } else {
          handleUndo();
        }

        return;
      }

      if (
        event.key.toLowerCase() ===
        "y"
      ) {
        event.preventDefault();

        handleRedo();

        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        setZoom(100);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  });

  /* =========================================
     RETURN TO UPLOAD SCREEN
     ========================================= */

  const handleBack = () => {
    documentSessionRef.current +=
      1;

    clearHistoryTimer();

    historySnapshotRef.current =
      null;

    fieldsRef.current =
      [];

    pastRef.current =
      [];

    futureRef.current =
      [];

    setFile(null);

    setFields([]);

    setPast([]);

    setFuture([]);

    setDocxDocumentElement(
      null,
    );

    setSelectedFieldId(
      null,
    );

    setTool(
      "select",
    );

    setIsExporting(
      false,
    );

    setIsSaved(
      false,
    );

    setZoom(100);
  };

  /* =========================================
     SAVE
     ========================================= */

  const handleSave = () => {
    if (!file) {
      return;
    }

    const savedState:
      SavedDocumentState = {
      fileName:
        file.name,

      fileSize:
        file.size,

      lastModified:
        file.lastModified,

      fields:
        cloneFields(
          fieldsRef.current,
        ),

      savedAt:
        getTimestamp(),
    };

    try {
      window.localStorage.setItem(
        getStorageKey(file),
        JSON.stringify(
          savedState,
        ),
      );

      setIsSaved(
        true,
      );

      void persistCurrentDocument(
        file,
        fieldsRef.current,
      ).catch((error) => {
        console.warn(
          "Unable to update the SignFlow document library.",
          error,
        );
      });
    } catch (error) {
      console.error(
        "Save error:",
        error,
      );

      window.alert(
        "Unable to save this document state in your browser.",
      );
    }
  };

  /* =========================================
     EXPORT
     ========================================= */

  const handleExport =
    async () => {
      if (!file) {
        return;
      }

      flushPendingHistory();

      setIsExporting(
        true,
      );

      try {
        if (isPdf) {
          await downloadExportedPdf(
            file,
            fieldsRef.current,
          );

          return;
        }

        if (isImage) {
          await exportImage(
            file,
            fieldsRef.current,
          );

          return;
        }

        if (isDocx) {
          if (
            !docxDocumentElement
          ) {
            window.alert(
              "The DOCX document is still loading. Please wait a moment and try again.",
            );

            return;
          }

          await downloadExportedDocx(
            {
              element:
                docxDocumentElement,

              fileName:
                file.name,
            },
          );

          return;
        }

        window.alert(
          "Export for this file type is not available yet.",
        );
      } catch (error) {
        console.error(
          "Export error:",
          error,
        );

        window.alert(
          "Something went wrong while exporting the document.",
        );
      } finally {
        setIsExporting(
          false,
        );
      }
    };

  /* =========================================
     ZOOM
     ========================================= */

  const handleZoomOut =
    () => {
      setZoom(
        (currentZoom) =>
          Math.max(
            MIN_ZOOM,
            currentZoom -
              ZOOM_STEP,
          ),
      );
    };

  const handleZoomIn =
    () => {
      setZoom(
        (currentZoom) =>
          Math.min(
            MAX_ZOOM,
            currentZoom +
              ZOOM_STEP,
          ),
      );
    };

  const handleZoomReset =
    () => {
      setZoom(100);
    };

  const zoomLabel =
    `${zoom}%`;

  /* =========================================
     SELECTED FIELD
     ========================================= */

  const selectedField =
    selectedFieldId
      ? fields.find(
          (field) =>
            field.id ===
            selectedFieldId,
        ) ?? null
      : null;

  /* =========================================
     UPLOAD SCREEN
     ========================================= */

  if (!file) {
    return (
      <>
        <style>{`
          .signflow-dashboard { min-height: 100vh; background: #f7f8fa; color: #15171a; padding: 28px; box-sizing: border-box; }
          .signflow-dashboard-inner { width: min(1180px, 100%); margin: 0 auto; }
          .signflow-dashboard-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 34px; }
          .signflow-dashboard-brand { display: flex; align-items: center; gap: 11px; font-weight: 800; font-size: 22px; }
          .signflow-dashboard-mark { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: #15171a; color: #fff; font-weight: 800; }
          .signflow-dashboard-new { border: 0; border-radius: 11px; background: #15171a; color: #fff; padding: 12px 17px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; }
          .signflow-dashboard-heading { margin-bottom: 22px; }
          .signflow-dashboard-heading h1 { margin: 0 0 7px; font-size: clamp(28px, 5vw, 40px); letter-spacing: -1.4px; }
          .signflow-dashboard-heading p { margin: 0; color: #6c727b; }
          .signflow-dashboard-toolbar { display: flex; gap: 12px; margin-bottom: 24px; }
          .signflow-dashboard-search { flex: 1; min-width: 0; border: 1px solid #dfe2e7; background: #fff; border-radius: 11px; padding: 12px 14px; outline: none; font: inherit; box-sizing: border-box; }
          .signflow-dashboard-search:focus { border-color: #15171a; }
          .signflow-dashboard-upload { border: 1px solid #dfe2e7; background: #fff; color: #15171a; border-radius: 11px; padding: 0 16px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; white-space: nowrap; }
          .signflow-dashboard-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
          .signflow-document-card { background: #fff; border: 1px solid #e4e6ea; border-radius: 16px; padding: 18px; min-width: 0; transition: transform .18s ease, box-shadow .18s ease; }
          .signflow-document-card:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(15, 18, 22, .08); }
          .signflow-document-card-top { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 28px; }
          .signflow-document-icon { width: 44px; height: 44px; border-radius: 12px; background: #f0f2f5; display: grid; place-items: center; }
          .signflow-document-actions { display: flex; gap: 4px; }
          .signflow-document-actions button { width: 34px; height: 34px; border: 0; background: transparent; border-radius: 8px; display: grid; place-items: center; cursor: pointer; color: #737983; }
          .signflow-document-actions button:hover { background: #f1f2f4; color: #15171a; }
          .signflow-document-actions .danger:hover { color: #c62828; background: #fff1f1; }
          .signflow-document-name { font-weight: 750; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 7px; }
          .signflow-document-meta { color: #7a8089; font-size: 13px; display: flex; align-items: center; gap: 6px; }
          .signflow-document-open { width: 100%; margin-top: 17px; border: 1px solid #e0e3e7; background: #fff; border-radius: 9px; padding: 10px 12px; cursor: pointer; font-weight: 700; }
          .signflow-document-open:hover { background: #f6f7f8; }
          .signflow-empty-library { border: 1px dashed #d4d8de; background: #fff; border-radius: 18px; min-height: 320px; display: grid; place-items: center; text-align: center; padding: 30px; box-sizing: border-box; }
          .signflow-empty-library-icon { width: 64px; height: 64px; border-radius: 18px; background: #f0f2f5; display: grid; place-items: center; margin: 0 auto 16px; }
          .signflow-empty-library h2 { margin: 0 0 7px; }
          .signflow-empty-library p { color: #777d86; margin: 0 0 20px; }
          .signflow-empty-library-button { border: 0; background: #15171a; color: #fff; border-radius: 10px; padding: 11px 17px; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; }
          .signflow-rename { display: flex; gap: 6px; margin-bottom: 7px; }
          .signflow-rename input { min-width: 0; flex: 1; border: 1px solid #cfd3d8; border-radius: 7px; padding: 7px 8px; outline: none; font: inherit; }
          .signflow-rename button { border: 0; border-radius: 7px; background: #15171a; color: #fff; padding: 0 9px; cursor: pointer; }
          @media (max-width: 900px) { .signflow-dashboard { padding: 20px; } .signflow-dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
          @media (max-width: 600px) { .signflow-dashboard { padding: 16px; } .signflow-dashboard-header { margin-bottom: 26px; } .signflow-dashboard-new span { display: none; } .signflow-dashboard-grid { grid-template-columns: 1fr; } .signflow-dashboard-toolbar { flex-direction: column; } .signflow-dashboard-upload { min-height: 44px; justify-content: center; } }
        `}</style>

        <main className="signflow-dashboard">
          <div className="signflow-dashboard-inner">
            <header className="signflow-dashboard-header">
              <div className="signflow-dashboard-brand">
                <div className="signflow-dashboard-mark">S</div>
                <span>SignFlow</span>
              </div>

              <label
                className="signflow-dashboard-new"
                style={{
                  minHeight: 44,
                  boxSizing: "border-box",
                  touchAction: "manipulation",
                }}
              >
                <Upload size={17} />
                <span>New document</span>
                <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={handleUpload} hidden />
              </label>
            </header>

            <section className="signflow-dashboard-heading">
              <h1>Your documents</h1>
              <p>Open a previous document or start a new signing workflow.</p>
            </section>

            <div className="signflow-dashboard-toolbar">
              <input className="signflow-dashboard-search" type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search documents..." aria-label="Search documents" />
              <label
                className="signflow-dashboard-upload"
                style={{
                  minHeight: 44,
                  boxSizing: "border-box",
                  touchAction: "manipulation",
                }}
              >
                <Upload size={17} />
                Upload
                <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={handleUpload} hidden />
              </label>
            </div>

            {isLibraryLoading ? (
              <div className="signflow-empty-library"><div>Loading your documents...</div></div>
            ) : filteredLibraryDocuments.length > 0 ? (
              <div className="signflow-dashboard-grid">
                {filteredLibraryDocuments.map((document) => {
                  const extension = document.fileName.split(".").pop()?.toUpperCase() ?? "FILE";
                  const modified = new Date(document.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

                  return (
                    <article
                      className="signflow-document-card"
                      key={document.id}
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        boxSizing: "border-box",
                      }}
                    >
                      <div className="signflow-document-card-top">
                        <div className="signflow-document-icon"><FileText size={21} /></div>
                        <div className="signflow-document-actions">
                          <button type="button" onClick={() => startRenameDocument(document)} title="Rename document" aria-label={`Rename ${document.fileName}`}><Pencil size={16} /></button>
                          <button type="button" className="danger" onClick={() => void handleDeleteLibraryDocument(document)} title="Delete document" aria-label={`Delete ${document.fileName}`}><Trash2 size={16} /></button>
                        </div>
                      </div>

                      {editingDocumentId === document.id ? (
                        <div className="signflow-rename">
                          <input value={editingDocumentName} onChange={(event) => setEditingDocumentName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveRenamedDocument(document); if (event.key === "Escape") cancelRenameDocument(); }} autoFocus aria-label="New document name" />
                          <button type="button" onClick={() => void saveRenamedDocument(document)} aria-label="Save new name">✓</button>
                          <button type="button" onClick={cancelRenameDocument} aria-label="Cancel rename"><X size={15} /></button>
                        </div>
                      ) : (
                        <div className="signflow-document-name" title={document.fileName}>{document.fileName}</div>
                      )}

                      <div className="signflow-document-meta">
                        <span>{extension}</span><span>•</span><Clock3 size={13} /><span>{modified}</span>
                      </div>

                      <button type="button" className="signflow-document-open" onClick={() => void handleOpenLibraryDocument(document)}>Open document</button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="signflow-empty-library">
                <div>
                  <div className="signflow-empty-library-icon"><FolderOpen size={28} /></div>
                  <h2>{librarySearch.trim() ? "No matching documents" : "Your document library is empty"}</h2>
                  <p>{librarySearch.trim() ? "Try another search term." : "Upload your first PDF, DOCX, PNG or JPG document to get started."}</p>
                  {!librarySearch.trim() && (
                    <label className="signflow-empty-library-button">
                      Upload a document
                      <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={handleUpload} hidden />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </>
    );
  }

  /* =========================================
     EDITOR
     ========================================= */

  return (
    <div className="app">
      {/* =================================
          TOP BAR
          ================================= */}

      <header
        className="topbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5000,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          flexShrink: 0,
          boxSizing: "border-box",
        }}
      >
        <div className="topbar-left">
          <button
            type="button"
            className="icon-button"
            onClick={
              handleBack
            }
            aria-label="Back"
          >
            <ArrowLeft
              size={19}
            />
          </button>

          <div className="document-title">
            <FileText
              size={18}
            />

            <span>
              {file.name}
            </span>

            <ChevronDown
              size={15}
            />
          </div>
        </div>

        <div className="topbar-center">
          <button
            type="button"
            className="icon-button"
            onClick={
              handleUndo
            }
            disabled={
              past.length ===
              0
            }
            aria-label="Undo"
            title="Undo"
          >
            <Undo2
              size={18}
            />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={
              handleRedo
            }
            disabled={
              future.length ===
              0
            }
            aria-label="Redo"
            title="Redo"
          >
            <Redo2
              size={18}
            />
          </button>

          <div className="divider" />

          <button
            type="button"
            className="zoom-button"
            onClick={
              handleZoomOut
            }
            disabled={
              zoom <=
              MIN_ZOOM
            }
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>

          <button
            type="button"
            className="zoom-button"
            onClick={handleZoomReset}
            disabled={zoom === 100}
            aria-label="Reset zoom to 100%"
            title="Reset zoom to 100%"
          >
            100%
          </button>

          <span
            className="zoom"
            aria-live="polite"
            aria-label={`Current zoom ${zoomLabel}`}
          >
            {zoomLabel}
          </span>

          <button
            type="button"
            className="zoom-button"
            onClick={
              handleZoomIn
            }
            disabled={
              zoom >=
              MAX_ZOOM
            }
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="secondary-button"
            onClick={
              handleSave
            }
            title={
              isSaved
                ? "Saved"
                : "Save document"
            }
          >
            <Save
              size={17}
            />

            {isSaved
              ? "Saved"
              : "Save"}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={
              handleExport
            }
            disabled={
              isExporting
            }
          >
            <Download
              size={17}
            />

            {isExporting
              ? "Exporting..."
              : "Export"}
          </button>
        </div>
      </header>

      <div
        className="workspace"
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          height: "calc(100vh - 64px)",
          minHeight: 0,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* =================================
            LEFT TOOLBAR
            ================================= */}

        <aside className="sidebar">
          <div className="sidebar-heading">
            TOOLS
          </div>

          <div className="tools">
            {tools.map(
              (item) => {
                const Icon =
                  item.icon;

                return (
                  <button
                    type="button"
                    key={
                      item.id
                    }
                    className={`tool ${
                      tool ===
                      item.id
                        ? "tool-active"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedFieldId(
                        null,
                      );

                      setTool(
                        item.id,
                      );
                    }}
                  >
                    <Icon
                      size={19}
                    />

                    <span>
                      {
                        item.label
                      }
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </aside>

        {/* =================================
            DOCUMENT CANVAS
            ================================= */}

        <main
          className="canvas-area"
          style={{
            minWidth: 0,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div
            className="document-page"
            data-signflow-zoom={
              zoom
            }
          >
            {isPdf ? (
              <DocumentViewer
                file={file}
                activeTool={
                  tool
                }
                fields={
                  fields
                }
                selectedFieldId={
                  selectedFieldId
                }
                zoom={
                  zoom
                }
                onAddField={
                  addField
                }
                onUpdateField={
                  updateField
                }
                onDeleteField={
                  deleteField
                }
                onSelectField={
                  selectField
                }
              />
            ) : isImage ? (
              <ImageViewer
                file={file}
                activeTool={
                  tool
                }
                fields={
                  fields
                }
                selectedFieldId={
                  selectedFieldId
                }
                zoom={zoom}
                onAddField={
                  addField
                }
                onUpdateField={
                  updateField
                }
                onDeleteField={
                  deleteField
                }
                onSelectField={
                  selectField
                }
              />
            ) : isDocx ? (
              <DocxViewer
                file={file}
                activeTool={
                  tool
                }
                fields={
                  fields
                }
                selectedFieldId={
                  selectedFieldId
                }
                zoom={zoom}
                onAddField={
                  addField
                }
                onUpdateField={
                  updateField
                }
                onDeleteField={
                  deleteField
                }
                onSelectField={
                  selectField
                }
                onDocumentReady={
                  setDocxDocumentElement
                }
              />
            ) : (
              <div className="document-placeholder">
                <FileText
                  size={42}
                />

                <h2>
                  {file.name}
                </h2>

                <p>
                  This file type
                  will be supported
                  in the next stage.
                </p>

                <span>
                  PDF, DOCX, PNG and
                  JPG editing is
                  currently enabled.
                </span>
              </div>
            )}
          </div>
        </main>

        {/* =================================
            RIGHT PROPERTIES
            ================================= */}

        <aside className="properties">
          <div className="sidebar-heading">
            PROPERTIES
          </div>

          {selectedField ? (
            <div className="selected-tool">
              <div className="selected-icon">
                {(() => {
                  const selectedTool =
                    tools.find(
                      (item) =>
                        item.id ===
                        selectedField.type,
                    );

                  const Icon =
                    selectedTool?.icon ??
                    MousePointer2;

                  return (
                    <Icon
                      size={20}
                    />
                  );
                })()}
              </div>

              <h3>
                {tools.find(
                  (item) =>
                    item.id ===
                    selectedField.type,
                )?.label ??
                  "Field"}
              </h3>

              <p>
                {selectedField.type ===
                "signature"
                  ? "Create, draw, type or upload your signature."
                  : selectedField.type ===
                      "date"
                    ? "Set the date that will appear on the document."
                    : selectedField.type ===
                        "checkbox"
                      ? "Check or uncheck this field on the document."
                      : selectedField.type ===
                          "name"
                        ? "Enter the name that should appear on the document."
                        : selectedField.type ===
                            "email"
                          ? "Enter the email address that should appear on the document."
                          : "Use the field on the document to enter and position your text."}
              </p>

              <button
                type="button"
                className="property-delete"
                onClick={() =>
                  deleteField(
                    selectedField.id,
                  )
                }
              >
                Delete field
              </button>
            </div>
          ) : tool ===
            "select" ? (
            <div className="empty-properties">
              <MousePointer2
                size={22}
              />

              <p>
                Select an element
                to edit its
                properties.
              </p>
            </div>
          ) : (
            <div className="selected-tool">
              <div className="selected-icon">
                {(() => {
                  const selected =
                    tools.find(
                      (item) =>
                        item.id ===
                        tool,
                    );

                  const Icon =
                    selected?.icon ??
                    MousePointer2;

                  return (
                    <Icon
                      size={20}
                    />
                  );
                })()}
              </div>

              <h3>
                {
                  tools.find(
                    (item) =>
                      item.id ===
                      tool,
                  )?.label
                }
              </h3>

              <p>
                {tool ===
                "signature"
                  ? "Click on the document to place a signature field. You can then draw, type or upload your signature."
                  : tool ===
                      "date"
                    ? "Click on the document to place a date field."
                    : tool ===
                        "checkbox"
                      ? "Click on the document to place a checkbox."
                      : tool ===
                          "name"
                        ? "Click on the document to place a name field."
                        : tool ===
                            "email"
                          ? "Click on the document to place an email field."
                          : "Click on the document to place this field."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
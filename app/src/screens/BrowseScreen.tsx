import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useConnectionStore } from '../store/useConnectionStore';

type Entry = { name: string; isDirectory: boolean; label?: string | null };
type BrowseResult = { path: string | null; parent: string | null; entries: Entry[] };

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export function BrowseScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { host, port, token } = useConnectionStore();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchListing = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`http://${host}:${port}/api/browse${params}`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      clearTimeout(timeout);
      const data: BrowseResult & { error?: string } = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setCurrentPath(data.path);
      setParent(data.parent);
      setEntries(data.entries);
    } catch (err: any) {
      clearTimeout(timeout);
      setError(err.name === 'AbortError' ? 'Request timed out' : err.message);
    } finally {
      setLoading(false);
    }
  }, [host, port, token]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const navigateToDir = (dirName: string) => {
    if (currentPath === null) {
      // At drive list level — dirName is like "C:\"
      fetchListing(dirName);
    } else {
      const sep = currentPath.includes('/') ? '/' : '\\';
      const newPath = currentPath.endsWith(sep)
        ? currentPath + dirName
        : currentPath + sep + dirName;
      fetchListing(newPath);
    }
  };

  const navigateUp = () => {
    if (parent) {
      fetchListing(parent);
    } else {
      // Go back to drive list (no path)
      fetchListing();
    }
  };

  const selectCurrent = () => {
    if (!currentPath) return;
    const name = currentPath.split(/[\\/]/).filter(Boolean).pop() || currentPath;
    navigation.navigate('Home', { selectedPath: currentPath, selectedName: name });
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !currentPath) return;

    const sep = currentPath.includes('/') ? '/' : '\\';
    const fullPath = currentPath.endsWith(sep)
      ? currentPath + name
      : currentPath + sep + name;

    setCreating(true);
    try {
      const res = await fetch(`http://${host}:${port}/api/mkdir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path: fullPath }),
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Error', data.error);
      } else {
        setShowNewFolder(false);
        setNewFolderName('');
        fetchListing(data.path);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  };

  const renderItem = ({ item }: { item: Entry | { name: '..'; isUp: true } }) => {
    if ('isUp' in item) {
      return (
        <TouchableOpacity style={styles.entry} onPress={navigateUp}>
          <Text style={styles.folderIcon}>{'\u{1F4C1}'}</Text>
          <Text style={styles.entryName}>..</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={styles.entry} onPress={() => navigateToDir(item.name)}>
        <Text style={styles.folderIcon}>{'\u{1F4C2}'}</Text>
        <Text style={styles.entryName} numberOfLines={1}>
          {item.name}
          {item.label ? <Text style={styles.driveLabel}>  {item.label}</Text> : null}
        </Text>
      </TouchableOpacity>
    );
  };

  const showUpEntry = currentPath !== null;
  const listData: any[] = showUpEntry
    ? [{ name: '..', isUp: true }, ...entries]
    : entries;

  return (
    <View style={styles.container}>
      {/* Current path header */}
      <View style={styles.pathHeader}>
        <Text style={styles.pathLabel}>Current path:</Text>
        <Text style={styles.pathText} numberOfLines={2}>
          {currentPath || 'Drives'}
        </Text>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#da7756" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchListing(currentPath || undefined)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, index) => ('isUp' in item ? '..' : item.name) + index}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={entries.length === 0 ? styles.emptyList : undefined}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !showUpEntry ? (
              <Text style={styles.emptyText}>No directories found</Text>
            ) : null
          }
        />
      )}

      {/* Bottom bar */}
      {currentPath && !loading && !error && (
        <View style={[styles.selectContainer, { paddingBottom: Math.max(48, insets.bottom + 12) }]}>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.newFolderButton}
              onPress={() => setShowNewFolder(true)}
            >
              <Text style={styles.newFolderButtonText}>New Folder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selectButton, { flex: 1 }]} onPress={selectCurrent}>
              <Text style={styles.selectText}>Select This Directory</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* New Folder modal */}
      <Modal
        visible={showNewFolder}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowNewFolder(false); setNewFolderName(''); }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Folder</Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>in {currentPath}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Folder name"
              placeholderTextColor="#666"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              onSubmitEditing={createFolder}
              editable={!creating}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => { setShowNewFolder(false); setNewFolderName(''); }}
                disabled={creating}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreateButton, (!newFolderName.trim() || creating) && styles.buttonDisabled]}
                onPress={createFolder}
                disabled={!newFolderName.trim() || creating}
              >
                <Text style={styles.selectText}>{creating ? '...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  pathHeader: {
    backgroundColor: '#252526',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3c3c3c',
  },
  pathLabel: {
    color: '#808080',
    fontSize: 12,
    marginBottom: 4,
  },
  pathText: {
    color: '#da7756',
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#f44747',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3c3c3c',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#d4d4d4',
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d2d',
  },
  folderIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  entryName: {
    color: '#d4d4d4',
    fontSize: 15,
    flex: 1,
  },
  driveLabel: {
    color: '#808080',
    fontSize: 14,
  },
  selectContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#3c3c3c',
    backgroundColor: '#1e1e1e',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  selectButton: {
    backgroundColor: '#da7756',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  selectText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  newFolderButton: {
    backgroundColor: '#3c3c3c',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  newFolderButtonText: {
    color: '#d4d4d4',
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalCard: {
    backgroundColor: '#252526',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  modalTitle: {
    color: '#d4d4d4',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#808080',
    fontSize: 13,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#2d2d2d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#d4d4d4',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#da7756',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  modalCreateButton: {
    backgroundColor: '#da7756',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: '#d4d4d4',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

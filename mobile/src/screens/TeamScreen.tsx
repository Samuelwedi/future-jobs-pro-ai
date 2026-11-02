import { AdaptiveModal as Modal } from "../components/AdaptiveModal";
import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

interface Member {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  needs_password_change: boolean;
  last_login: string;
}

export default function TeamScreen() {
  const { user } = useAuth();
  const manager = ["boss", "owner", "manager", "admin"].includes(
      String(user?.role).toLowerCase(),
    ),
    privileged = ["boss", "owner", "admin"].includes(
      String(user?.role).toLowerCase(),
    );
  const canManage = (member: Member) =>
    manager &&
    member.id !== user?.id &&
    ["employee", "manager"].includes(member.role) &&
    (member.role === "employee" || privileged);
  const navigation = useNavigation();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formRole, setFormRole] = useState("employee");

  const fetchMembers = async () => {
    try {
      const res = await api.get<{ success: boolean; members: Member[] }>(
        `/team/members/${user?.companyId}`,
      );
      setMembers(res.members || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMembers();
  };

  const handleInvite = async () => {
    if (!formEmail || !formFirstName || !formLastName) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    try {
      const res = await api.post<{
        success: boolean;
        tempPassword: string;
        emailSent: boolean;
      }>("/team/invite", {
        companyId: user?.companyId,
        email: formEmail,
        firstName: formFirstName,
        lastName: formLastName,
        role: formRole,
        invitedBy: user?.id,
      });
      Alert.alert(
        "Employee created",
        `${res.emailSent ? "Invitation accepted for email delivery." : "Email delivery failed. Share credentials securely."}\nTemporary password: ${res.tempPassword}\nThe employee must change it after signing in.`,
      );
      setModalVisible(false);
      setFormEmail("");
      setFormFirstName("");
      setFormLastName("");
      fetchMembers();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleChangeRole = (member: Member) => {
    const newRole = member.role === "employee" ? "manager" : "employee";
    Alert.alert(
      "Change Role",
      `Change ${member.first_name}'s role to ${newRole}?`,
      [
        { text: "Cancel" },
        {
          text: "Yes",
          onPress: async () => {
            try {
              await api.put(`/team/${member.id}/role`, {
                role: newRole,
                companyId: user?.companyId,
              });
              await fetchMembers();
            } catch (e: any) {
              Alert.alert(
                "Team action failed",
                e.response?.data?.message || e.message,
              );
            }
          },
        },
      ],
    );
  };

  const handleTransferOwnership = (member: Member) => {
    Alert.alert(
      "Make this manager the Boss?",
      `${member.first_name} ${member.last_name} will become the company owner. Your account will become a manager.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Final confirmation",
              "This transfers company-wide Boss permissions. You will need to sign in again so your permissions refresh.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Transfer ownership",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const response = await api.post<{
                        success: boolean;
                        message: string;
                      }>(`/team/${member.id}/transfer-ownership`, {
                        confirmation: "TRANSFER OWNERSHIP",
                      });
                      await fetchMembers();
                      Alert.alert(
                        "Ownership transferred",
                        `${response.message}. Sign out and back in to refresh your access.`,
                      );
                    } catch (error: any) {
                      Alert.alert(
                        "Transfer failed",
                        error?.response?.data?.message ||
                          error.message ||
                          "Please try again",
                      );
                    }
                  },
                },
              ],
            ),
        },
      ],
    );
  };

  const handleRemove = (member: Member) => {
    Alert.alert(
      "Deactivate Employee",
      `Are you sure you want to deactivate ${member.first_name} and retain historical records?`,
      [
        { text: "Cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/team/${member.id}`);
              await fetchMembers();
            } catch (e: any) {
              Alert.alert(
                "Team action failed",
                e.response?.data?.message || e.message,
              );
            }
          },
        },
      ],
    );
  };

  const renderMember = ({ item }: { item: Member }) => (
    <View style={styles.memberCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName}>
          {item.first_name} {item.last_name}
        </Text>
        <Text style={styles.memberEmail}>{item.email}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <Text
            style={[
              styles.roleBadge,
              item.role === "boss" && styles.roleBoss,
              item.role === "manager" && styles.roleManager,
            ]}
          >
            {item.role}
          </Text>
          {item.is_active === false && (
            <Text style={styles.needsPwBadge}>Inactive</Text>
          )}
          {item.needs_password_change && (
            <Text style={styles.needsPwBadge}>Needs Password</Text>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        {privileged && canManage(item) && (
          <TouchableOpacity onPress={() => handleChangeRole(item)}>
            <MaterialIcons name="swap-horiz" size={24} color="#00D4FF" />
          </TouchableOpacity>
        )}
        {["boss", "owner"].includes(String(user?.role).toLowerCase()) &&
          item.role === "manager" &&
          item.is_active !== false && (
            <TouchableOpacity
              accessibilityLabel={`Make ${item.first_name} the company Boss`}
              onPress={() => handleTransferOwnership(item)}
            >
              <MaterialIcons
                name="workspace-premium"
                size={24}
                color="#FFD54F"
              />
            </TouchableOpacity>
          )}
        {canManage(item) && item.is_active !== false && (
          <TouchableOpacity onPress={() => handleRemove(item)}>
            <MaterialIcons name="delete" size={24} color="#F44336" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading)
    return (
      <ActivityIndicator
        size="large"
        color="#00D4FF"
        style={{ flex: 1, backgroundColor: "#0A0A0A" }}
      />
    );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00D4FF"
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>No team members</Text>}
      />
      {manager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setModalVisible(true)}
        >
          <MaterialIcons name="person-add" size={28} color="#0A0A0A" />
        </TouchableOpacity>
      )}

      <Modal
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        animationType="slide"
        transparent
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ flexGrow: 0, maxHeight: "100%" }}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.modalTitle}>Invite Employee</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#888"
              value={formEmail}
              onChangeText={setFormEmail}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="First Name"
              placeholderTextColor="#888"
              value={formFirstName}
              onChangeText={setFormFirstName}
            />
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              placeholderTextColor="#888"
              value={formLastName}
              onChangeText={setFormLastName}
            />
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  formRole === "employee" && styles.roleBtnActive,
                ]}
                onPress={() => setFormRole("employee")}
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    formRole === "employee" && styles.roleBtnTextActive,
                  ]}
                >
                  Employee
                </Text>
              </TouchableOpacity>
              {privileged && (
                <TouchableOpacity
                  style={[
                    styles.roleBtn,
                    formRole === "manager" && styles.roleBtnActive,
                  ]}
                  onPress={() => setFormRole("manager")}
                >
                  <Text
                    style={[
                      styles.roleBtnText,
                      formRole === "manager" && styles.roleBtnTextActive,
                    ]}
                  >
                    Manager
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleInvite} style={styles.submitBtn}>
                <Text style={styles.submitText}>Invite</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: "#0A0A0A",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    padding: 8,
    marginLeft: 4,
  },
  headerTitle: {
    flexShrink: 1,
    color: "#FFF",
    fontSize: 22,
    fontWeight: "bold",
  },
  list: { paddingHorizontal: 20 },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  memberName: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  memberEmail: { color: "#888", fontSize: 13, marginTop: 2 },
  roleBadge: {
    backgroundColor: "#00D4FF20",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    color: "#00D4FF",
    fontSize: 12,
    fontWeight: "600",
    overflow: "hidden",
  },
  roleBoss: { backgroundColor: "#E91E6320", color: "#E91E63" },
  roleManager: { backgroundColor: "#FF980020", color: "#FF9800" },
  needsPwBadge: {
    backgroundColor: "#F4433620",
    color: "#F44336",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "600",
    overflow: "hidden",
  },
  actions: { flexDirection: "row", gap: 16 },
  empty: { color: "#888", textAlign: "center", marginTop: 40, fontSize: 16 },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    backgroundColor: "#00D4FF",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: { backgroundColor: "#1A1A1A", borderRadius: 16, padding: 24 },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#0A0A0A",
    borderRadius: 10,
    padding: 12,
    color: "#FFF",
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 12,
  },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  roleBtnActive: { backgroundColor: "#00D4FF", borderColor: "#00D4FF" },
  roleBtnText: { color: "#888", fontWeight: "500" },
  roleBtnTextActive: { color: "#0A0A0A", fontWeight: "600" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#888",
  },
  cancelText: { color: "#888" },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#00D4FF",
  },
  submitText: { color: "#0A0A0A", fontWeight: "600" },
});

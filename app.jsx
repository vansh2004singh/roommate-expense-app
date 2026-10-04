import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  Home,
  Users,
  UserPlus,
  Plus,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Receipt,
  ArrowRightLeft,
  Trash2,
  LogOut,
  Calendar,
  X,
  AlertCircle,
  Sparkles,
  Shield,
  Mail,
  User,
  Lock,
  Share2,
  Copy,
  Check,
  CreditCard,
  RefreshCw,
} from 'lucide-react';

export default function App() {
  // Session & User State
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);

  // Auth Form State
  const [isSignUp, setIsSignUp] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authFlatName, setAuthFlatName] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Add Flatmate State
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState(null);

  // Add Expense State
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [selectedSplitMemberKeys, setSelectedSplitMemberKeys] = useState([]);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState(null);

  // Settlement Form State
  const [settlePayerKey, setSettlePayerKey] = useState('');
  const [settlePayeeKey, setSettlePayeeKey] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // ============================================================================
  // 1. AUTHENTICATION & SESSION LISTENER
  // ============================================================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCurrentUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Helper to get consistent member identifier (user_id if registered, or invited_email)
  const getMemberKey = (member) => member.user_id || member.invited_email;

  // ============================================================================
  // 2. FETCH GROUP DATA & AUTO-LINK INVITED MEMBERSHIPS
  // ============================================================================
  const fetchGroupData = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch or create user profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (userProfile) {
        setProfile(userProfile);
      } else {
        const fallbackName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        const { data: newProf } = await supabase
          .from('profiles')
          .upsert({
            id: currentUser.id,
            email: currentUser.email,
            full_name: fallbackName,
          })
          .select()
          .single();
        setProfile(newProf);
      }

      // 2. Auto-Link: When invited roommate logs in with their Gmail, bind their user_id
      await supabase
        .from('group_members')
        .update({ user_id: currentUser.id })
        .ilike('invited_email', currentUser.email.trim())
        .is('user_id', null);

      // 3. Find all rooms the user belongs to
      const { data: userMemberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', currentUser.id);

      let groupIds = userMemberships ? userMemberships.map((m) => m.group_id) : [];

      // Also check groups created by this user
      const { data: createdGroups } = await supabase
        .from('groups')
        .select('id')
        .eq('created_by', currentUser.id);

      if (createdGroups) {
        groupIds = Array.from(new Set([...groupIds, ...createdGroups.map((g) => g.id)]));
      }

      if (groupIds.length === 0) {
        setCurrentGroup(null);
        setAllGroups([]);
        setLoading(false);
        return;
      }

      // Fetch all group records
      const { data: groupsList } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds)
        .order('id', { ascending: false });

      setAllGroups(groupsList || []);

      // Active group selection
      const activeGroup = currentGroup
        ? groupsList?.find((g) => g.id === currentGroup.id) || groupsList?.[0]
        : groupsList?.[0];

      setCurrentGroup(activeGroup);

      if (!activeGroup) {
        setLoading(false);
        return;
      }

      // 4. Fetch all group members
      const { data: mems } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', activeGroup.id);

      setMembers(mems || []);

      // 5. Fetch all expenses with splits for this group
      const { data: exps } = await supabase
        .from('expenses')
        .select('*, splits:expense_splits(*)')
        .eq('group_id', activeGroup.id)
        .order('expense_date', { ascending: false });

      setExpenses(exps || []);

      // 6. Fetch settlements for this group
      const { data: setts } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', activeGroup.id)
        .order('id', { ascending: false });

      setSettlements(setts || []);
    } catch (err) {
      console.error('Error fetching room data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, currentGroup]);

  useEffect(() => {
    if (currentUser) {
      fetchGroupData();
    }
  }, [currentUser, fetchGroupData]);

  // ============================================================================
  // 3. SUPABASE REALTIME CHANNEL SUBSCRIPTION
  // ============================================================================
  useEffect(() => {
    if (!currentGroup?.id) return;

    const channel = supabase
      .channel(`room-live-${currentGroup.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${currentGroup.id}` },
        () => fetchGroupData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expense_splits' },
        () => fetchGroupData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${currentGroup.id}` },
        () => fetchGroupData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${currentGroup.id}` },
        () => fetchGroupData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentGroup?.id, fetchGroupData]);

  // ============================================================================
  // 4. MAPS & CALCULATION LOGIC
  // ============================================================================
  const memberNameMap = useMemo(() => {
    const map = {};
    for (const m of members) {
      const key = getMemberKey(m);
      map[key] = m.invited_name;
      if (m.user_id) map[m.user_id] = m.invited_name;
    }
    return map;
  }, [members]);

  // Net Balance per member
  const memberBalances = useMemo(() => {
    const balances = {};
    for (const m of members) {
      balances[getMemberKey(m)] = 0;
    }

    // Add expenses
    for (const exp of expenses) {
      const payerKey = exp.paid_by;
      balances[payerKey] = (balances[payerKey] || 0) + Number(exp.amount);

      for (const split of exp.splits || []) {
        balances[split.user_id] = (balances[split.user_id] || 0) - Number(split.share_amount);
      }
    }

    // Add settlements (payer paid off debt -> net increases; payee received -> net decreases)
    for (const st of settlements) {
      balances[st.payer_id] = (balances[st.payer_id] || 0) + Number(st.amount);
      balances[st.payee_id] = (balances[st.payee_id] || 0) - Number(st.amount);
    }

    for (const k in balances) {
      balances[k] = Math.round(balances[k] * 100) / 100;
    }

    return balances;
  }, [members, expenses, settlements]);

  // Current user's net status
  const currentUserKey = useMemo(() => {
    const mem = members.find((m) => m.user_id === currentUser?.id);
    return mem ? getMemberKey(mem) : currentUser?.id;
  }, [members, currentUser]);

  const currentUserNet = currentUserKey ? memberBalances[currentUserKey] || 0 : 0;

  // Debt Simplification (Minimum Cash Flow Greedy Algorithm)
  const simplifiedDebts = useMemo(() => {
    const debtors = [];
    const creditors = [];
    const EPSILON = 0.01;

    for (const key in memberBalances) {
      const bal = memberBalances[key];
      if (bal < -EPSILON) {
        debtors.push({ key, debt: Math.abs(bal) });
      } else if (bal > EPSILON) {
        creditors.push({ key, credit: bal });
      }
    }

    debtors.sort((a, b) => b.debt - a.debt);
    creditors.sort((a, b) => b.credit - a.credit);

    const txs = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const transfer = Math.min(debtor.debt, creditor.credit);
      const rounded = Math.round(transfer * 100) / 100;

      if (rounded > 0) {
        txs.push({
          fromKey: debtor.key,
          fromName: memberNameMap[debtor.key] || 'Flatmate',
          toKey: creditor.key,
          toName: memberNameMap[creditor.key] || 'Flatmate',
          amount: rounded,
        });
      }

      debtor.debt = Math.round((debtor.debt - transfer) * 100) / 100;
      creditor.credit = Math.round((creditor.credit - transfer) * 100) / 100;

      if (debtor.debt < EPSILON) i++;
      if (creditor.credit < EPSILON) j++;
    }

    return txs;
  }, [memberBalances, memberNameMap]);

  const totalSpending = useMemo(() => {
    return expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
  }, [expenses]);

  // ============================================================================
  // 5. ACTION HANDLERS
  // ============================================================================

  // Auth Handler
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (isSignUp) {
        if (!authFullName.trim() || !authFlatName.trim()) {
          throw new Error('Please enter your full name and room/flat name.');
        }

        const { data: authData, error: signError } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (signError) throw signError;
        const user = authData.user;
        if (!user) throw new Error('Sign up failed.');

        // Insert into profiles
        await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email,
          full_name: authFullName.trim(),
        });

        // Create new Room/Flat
        const { data: newGroup, error: groupErr } = await supabase
          .from('groups')
          .insert({
            name: authFlatName.trim(),
            created_by: user.id,
          })
          .select()
          .single();
        if (groupErr) throw groupErr;

        // Add creator as Admin
        await supabase.from('group_members').insert({
          group_id: newGroup.id,
          user_id: user.id,
          invited_email: user.email.toLowerCase(),
          invited_name: authFullName.trim(),
          role: 'ADMIN',
        });

        setCurrentUser(user);
        await fetchGroupData();
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        setCurrentUser(data.user);
        await fetchGroupData();
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication error.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Google OAuth
  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      setAuthError(err.message);
    }
  };

  // Add Flatmate Handler
  const handleAddFlatmate = async (e) => {
    e.preventDefault();
    if (!currentGroup) return;
    setMemberLoading(true);
    setMemberError(null);

    try {
      const email = newMemberEmail.trim().toLowerCase();
      const name = newMemberName.trim();

      if (members.some((m) => m.invited_email.toLowerCase() === email)) {
        throw new Error('This roommate is already in this flat.');
      }

      // Check if profile exists with this email
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      const { error } = await supabase.from('group_members').insert({
        group_id: currentGroup.id,
        user_id: existingUser?.id || null,
        invited_email: email,
        invited_name: name,
        role: 'MEMBER',
      });

      if (error) throw error;

      setNewMemberName('');
      setNewMemberEmail('');
      setIsAddMemberOpen(false);
      await fetchGroupData();
    } catch (err) {
      setMemberError(err.message || 'Failed to add flatmate.');
    } finally {
      setMemberLoading(false);
    }
  };

  // Open Expense Modal
  const openAddExpense = () => {
    setExpensePaidBy(currentUserKey || getMemberKey(members[0]));
    setSelectedSplitMemberKeys(members.map(getMemberKey));
    setExpenseError(null);
    setIsAddExpenseOpen(true);
  };

  // Add Expense with dynamic split
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!currentGroup) return;
    setExpenseLoading(true);
    setExpenseError(null);

    try {
      const amt = parseFloat(expenseAmount);
      if (!amt || amt <= 0) throw new Error('Enter a valid amount greater than 0.');
      if (selectedSplitMemberKeys.length === 0) throw new Error('Select at least one member to split with.');

      // 1. Insert expense
      const { data: newExp, error: expErr } = await supabase
        .from('expenses')
        .insert({
          group_id: currentGroup.id,
          paid_by: expensePaidBy,
          title: expenseTitle.trim(),
          amount: amt,
          expense_date: new Date(expenseDate).toISOString(),
        })
        .select()
        .single();

      if (expErr) throw expErr;

      // 2. Calculate equal split per selected member
      const count = selectedSplitMemberKeys.length;
      const baseShare = Math.round((amt / count) * 100) / 100;
      let runningTotal = 0;

      const splitsPayload = selectedSplitMemberKeys.map((memberKey, idx) => {
        let finalShare = baseShare;
        if (idx === count - 1) {
          finalShare = Math.round((amt - runningTotal) * 100) / 100;
        } else {
          runningTotal += baseShare;
        }
        return {
          expense_id: newExp.id,
          user_id: memberKey,
          share_amount: finalShare,
        };
      });

      const { error: splitErr } = await supabase.from('expense_splits').insert(splitsPayload);
      if (splitErr) throw splitErr;

      setExpenseTitle('');
      setExpenseAmount('');
      setIsAddExpenseOpen(false);
      await fetchGroupData();
    } catch (err) {
      setExpenseError(err.message || 'Failed to add expense.');
    } finally {
      setExpenseLoading(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id, title) => {
    if (!window.confirm(`Delete expense "${title}"?`)) return;
    try {
      await supabase.from('expenses').delete().eq('id', id);
      await fetchGroupData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Record Settlement
  const handleRecordSettlement = async (e) => {
    e.preventDefault();
    if (!currentGroup) return;
    setSettleLoading(true);

    try {
      const amt = parseFloat(settleAmount);
      if (!amt || amt <= 0) throw new Error('Enter a valid settlement amount.');
      if (settlePayerKey === settlePayeeKey) throw new Error('Payer and payee cannot be the same person.');

      const { error } = await supabase.from('settlements').insert({
        group_id: currentGroup.id,
        payer_id: settlePayerKey,
        payee_id: settlePayeeKey,
        amount: amt,
        settled_at: new Date().toISOString(),
      });

      if (error) throw error;

      setIsSettleOpen(false);
      setSettleAmount('');
      await fetchGroupData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSettleLoading(false);
    }
  };

  // Toggle split member
  const toggleSplitMember = (key) => {
    if (selectedSplitMemberKeys.includes(key)) {
      if (selectedSplitMemberKeys.length <= 1) return;
      setSelectedSplitMemberKeys(selectedSplitMemberKeys.filter((k) => k !== key));
    } else {
      setSelectedSplitMemberKeys([...selectedSplitMemberKeys, key]);
    }
  };

  // Copy Room Link / Code
  const handleCopyCode = () => {
    if (!currentGroup) return;
    navigator.clipboard.writeText(currentGroup.id);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ============================================================================
  // RENDER: AUTH SCREEN
  // ============================================================================
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-8 text-white">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-3">
            <Home className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">SplitMate</h1>
          <p className="text-xs text-slate-400 mt-1">Multi-tenant roommate expense splitter & contri manager</p>
        </div>

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <div className="flex bg-slate-950 p-1 rounded-xl mb-5">
            <button
              onClick={() => { setIsSignUp(true); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                isSignUp ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Create New Flat
            </button>
            <button
              onClick={() => { setIsSignUp(false); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                !isSignUp ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In (Flatmate)
            </button>
          </div>

          {authError && (
            <div className="flex items-center gap-2 p-3 mb-4 text-xs text-rose-300 bg-rose-950/40 border border-rose-900 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-3.5">
            {isSignUp && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Your Real Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Aryan, Patrick, Rahul"
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Flat / Room Name
                  </label>
                  <div className="relative">
                    <Home className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Flat 204, Boys Hostel Room 12"
                      value={authFlatName}
                      onChange={(e) => setAuthFlatName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Gmail / Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="roommate@gmail.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition"
            >
              {authLoading ? 'Connecting...' : isSignUp ? 'Create Flat & Account' : 'Enter Room'}
            </button>
          </form>

          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <span className="relative bg-slate-900 px-2 text-[10px] text-slate-500 font-semibold uppercase">
              Or 1-Click
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.14z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Connecting to flatmate ledger...</span>
        </div>
      </div>
    );
  }

  const isOwed = currentUserNet > 0.01;
  const isOwes = currentUserNet < -0.01;

  // ============================================================================
  // RENDER: DASHBOARD VIEW
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white">{currentGroup?.name || 'My Flat'}</h1>
              <span className="flex h-2 w-2 relative" title="Live Realtime Sync Active">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Viewing as: <strong className="text-emerald-400">{profile?.full_name || currentUser?.email}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddMemberOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-200 border border-slate-700 transition"
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Flatmates ({members.length})</span>
            </button>

            <button
              onClick={openAddExpense}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded-xl text-white shadow-md shadow-emerald-600/20 transition"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Add Expense</span>
            </button>

            <button
              onClick={() => supabase.auth.signOut()}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Real-time Indicator banner */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-2xl text-[11px] text-emerald-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Instant sync: changes made by any roommate reflect live on every screen.</span>
          </div>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied Room ID' : 'Share Room'}</span>
          </button>
        </div>

        {/* Snapshot Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Net Balance Card */}
          <div
            className={`p-5 rounded-3xl border ${
              isOwed
                ? 'bg-emerald-950/20 border-emerald-500/30'
                : isOwes
                ? 'bg-rose-950/20 border-rose-500/30'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
              <span>Your Net Balance</span>
              {isOwed ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : isOwes ? (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-slate-500" />
              )}
            </div>
            <div className="mt-2">
              <div
                className={`text-3xl font-black ${
                  isOwed ? 'text-emerald-400' : isOwes ? 'text-rose-400' : 'text-slate-200'
                }`}
              >
                {isOwed && `+₹${Math.abs(currentUserNet).toFixed(2)}`}
                {isOwes && `-₹${Math.abs(currentUserNet).toFixed(2)}`}
                {!isOwed && !isOwes && '₹0.00'}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isOwed && 'You are owed money by your flatmates'}
                {isOwes && 'You owe money to your flatmates'}
                {!isOwed && !isOwes && 'You are completely settled up!'}
              </p>
            </div>
          </div>

          {/* Total Room Spending */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
              <span>Total Room Spending</span>
              <Receipt className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2">
              <div className="text-3xl font-black text-white">₹{totalSpending.toFixed(2)}</div>
              <p className="text-xs text-slate-400 mt-1">Across {expenses.length} shared purchases</p>
            </div>
          </div>

          {/* Quick Settlement Action */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase text-slate-400">Settlement Status</div>
              <div className="text-sm font-bold text-white mt-1">
                {simplifiedDebts.length} payment{simplifiedDebts.length === 1 ? '' : 's'} needed to settle all dues
              </div>
            </div>
            <button
              onClick={() => {
                if (simplifiedDebts.length > 0) {
                  setSettlePayerKey(simplifiedDebts[0].fromKey);
                  setSettlePayeeKey(simplifiedDebts[0].toKey);
                  setSettleAmount(simplifiedDebts[0].amount.toString());
                } else {
                  setSettlePayerKey(getMemberKey(members[0]));
                  setSettlePayeeKey(getMemberKey(members[1] || members[0]));
                  setSettleAmount('');
                }
                setIsSettleOpen(true);
              }}
              className="mt-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>Record Settlement</span>
            </button>
          </div>
        </div>

        {/* Member Breakdown & Debt Settle Recommendation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Member Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                Roommate Contri Breakdown
              </h3>
              <span className="text-[11px] text-slate-500">{members.length} roommates</span>
            </div>

            <div className="space-y-2">
              {members.map((m) => {
                const key = getMemberKey(m);
                const bal = memberBalances[key] || 0;
                const mOwed = bal > 0.01;
                const mOwes = bal < -0.01;

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">
                        {m.invited_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {m.invited_name} {m.user_id === currentUser?.id ? '(You)' : ''}
                        </div>
                        <div className="text-[10px] text-slate-500">{m.invited_email}</div>
                      </div>
                    </div>

                    <div
                      className={`text-xs font-bold ${
                        mOwed ? 'text-emerald-400' : mOwes ? 'text-rose-400' : 'text-slate-500'
                      }`}
                    >
                      {mOwed && `+₹${bal.toFixed(2)}`}
                      {mOwes && `-₹${Math.abs(bal).toFixed(2)}`}
                      {!mOwed && !mOwes && '₹0.00'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Settle Up Recommendations */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                Settle-Up Plan (Minimum Cash Flow)
              </h3>
              <span className="text-[10px] text-slate-500">Zero-waste transfers</span>
            </div>

            <div className="space-y-2">
              {simplifiedDebts.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1 opacity-80" />
                  <p className="text-xs font-bold text-slate-300">All accounts settled!</p>
                  <p className="text-[11px] text-slate-500">No debts pending in this flat.</p>
                </div>
              ) : (
                simplifiedDebts.map((tx, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-200">
                        {tx.fromName} pays {tx.toName}
                      </p>
                      <p className="text-xs font-black text-emerald-400 mt-0.5">₹{tx.amount.toFixed(2)}</p>
                    </div>

                    <button
                      onClick={() => {
                        setSettlePayerKey(tx.fromKey);
                        setSettlePayeeKey(tx.toKey);
                        setSettleAmount(tx.amount.toString());
                        setIsSettleOpen(true);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm"
                    >
                      Record Pay
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              Activity Feed & Ledger
            </h3>
            <span className="text-[11px] text-slate-500">{expenses.length} purchases</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {expenses.length === 0 ? (
              <p className="py-6 text-xs text-slate-500 text-center">
                No expenses logged yet. Tap "Add Expense" to log groceries, rent, or WiFi!
              </p>
            ) : (
              expenses.map((exp) => {
                const payerName = memberNameMap[exp.paid_by] || 'Roommate';
                const isPayer = exp.paid_by === currentUserKey;
                const splitNames = (exp.splits || [])
                  .map((s) => memberNameMap[s.user_id])
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div key={exp.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center font-bold text-emerald-400 text-xs">
                        {exp.title.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{exp.title}</h4>
                        <p className="text-[11px] text-slate-400">
                          Paid by <strong className="text-slate-200">{payerName}</strong> • Split with:{' '}
                          <span className="text-slate-300">{splitNames}</span>
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {new Date(exp.expense_date).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs font-black text-white">₹{Number(exp.amount).toFixed(2)}</div>
                        <div className={`text-[10px] font-bold ${isPayer ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {isPayer ? 'You paid' : 'Contri'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteExpense(exp.id, exp.title)}
                        className="p-1 text-slate-600 hover:text-rose-400 transition"
                        title="Delete expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* ====================================================================== */}
      {/* MODAL: ADD FLATMATE */}
      {/* ====================================================================== */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                Add Flatmate
              </h3>
              <button onClick={() => setIsAddMemberOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {memberError && (
              <div className="flex items-center gap-2 p-2.5 mb-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-900 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{memberError}</span>
              </div>
            )}

            <form onSubmit={handleAddFlatmate} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Flatmate Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sahil, Rahul, Jacob"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Roommate's Gmail / Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="roommate@gmail.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  When they sign in using this Gmail, they will automatically see this flat's expenses.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberLoading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20"
                >
                  {memberLoading ? 'Adding...' : 'Add Roommate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: ADD EXPENSE WITH DYNAMIC CONTRI SPLIT */}
      {/* ====================================================================== */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-400" />
                Add Shared Expense
              </h3>
              <button onClick={() => setIsAddExpenseOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {expenseError && (
              <div className="flex items-center gap-2 p-2.5 mb-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-900 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{expenseError}</span>
              </div>
            )}

            <form onSubmit={handleSaveExpense} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Item / Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sabzi, Ration, WiFi, Room Rent"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-2 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Paid By</label>
                <select
                  value={expensePaidBy}
                  onChange={(e) => setExpensePaidBy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {members.map((m) => {
                    const key = getMemberKey(m);
                    return (
                      <option key={m.id} value={key}>
                        {m.invited_name} {m.user_id === currentUser?.id ? '(You)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Split Between Interactive Checkboxes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">
                    Split Between ({selectedSplitMemberKeys.length} of {members.length} flatmates)
                  </label>
                  <span className="text-[11px] text-emerald-400 font-bold">
                    {selectedSplitMemberKeys.length > 0 && expenseAmount > 0
                      ? `₹${(parseFloat(expenseAmount) / selectedSplitMemberKeys.length).toFixed(2)}/each`
                      : ''}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {members.map((m) => {
                    const key = getMemberKey(m);
                    const isChecked = selectedSplitMemberKeys.includes(key);

                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between p-2 rounded-xl border transition ${
                          isChecked
                            ? 'bg-emerald-950/20 border-emerald-500/40 text-white'
                            : 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSplitMember(key)}
                            className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700"
                          />
                          <span className="text-xs font-semibold">
                            {m.invited_name} {m.user_id === currentUser?.id ? '(You)' : ''}
                          </span>
                        </label>

                        {isChecked && expenseAmount > 0 && (
                          <span className="text-xs font-bold text-emerald-400">
                            ₹{(parseFloat(expenseAmount) / selectedSplitMemberKeys.length).toFixed(2)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20"
                >
                  {expenseLoading ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: RECORD SETTLEMENT */}
      {/* ====================================================================== */}
      {isSettleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                Record Settlement
              </h3>
              <button onClick={() => setIsSettleOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSettlement} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Payer (Who Paid)
                </label>
                <select
                  value={settlePayerKey}
                  onChange={(e) => setSettlePayerKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                >
                  {members.map((m) => {
                    const key = getMemberKey(m);
                    return (
                      <option key={m.id} value={key}>
                        {m.invited_name}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Payee (Who Received)
                </label>
                <select
                  value={settlePayeeKey}
                  onChange={(e) => setSettlePayeeKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                >
                  {members.map((m) => {
                    const key = getMemberKey(m);
                    return (
                      <option key={m.id} value={key}>
                        {m.invited_name}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSettleOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settleLoading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl"
                >
                  {settleLoading ? 'Saving...' : 'Save Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

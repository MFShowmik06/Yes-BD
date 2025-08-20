USE yes_bd;

INSERT INTO users (username, email, password, user_type, status) VALUES
('buyer1', 'buyer1@example.com', '$2b$10$Y.Q.Z.X.Y.Z.A.B.C.D.E.F.G.H.I.J.K.L.M.N.O.P.Q.R.S.T.U', 'buyer', 'active'),
('seller1', 'seller1@example.com', '$2b$10$Y.Q.Z.X.Y.Z.A.B.C.D.E.F.G.H.I.J.K.L.M.N.O.P.Q.R.S.T.U', 'seller', 'active'),
('buyer2', 'buyer2@example.com', '$2b$10$Y.Q.Z.X.Y.Z.A.B.C.D.E.F.G.H.I.J.K.L.M.N.O.P.Q.R.S.T.U', 'buyer', 'blocked');